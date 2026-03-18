#!/usr/bin/env bash
# Configure ArgoCD for local development and deploy all extensions.
#
# This script replaces the old two-step flow (configure-argocd.sh + deploy-extensions).
# It configures ArgoCD settings, deploys extension backends, loads UI bundles,
# installs custom styles, and sets up RBAC. All in one go, with one argocd-server restart.
#
# Usage:
#   bash hack/setup-argocd.sh
#   EXTENSIONS="metrics logs" bash hack/setup-argocd.sh   # deploy subset

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ARGOCD_NS="${ARGOCD_NS:-argocd}"
PROJECT_ROOT="$(repo_root)"
EXTENSIONS="${EXTENSIONS:-metrics backups networking logs}"
UI_ONLY_EXTENSIONS="${UI_ONLY_EXTENSIONS:-argoplane}"

log "Setting up ArgoCD for local development"

# ---------------------------------------------------------------------------
# Step 1: Configure ArgoCD settings (ConfigMaps)
# ---------------------------------------------------------------------------

log "Configuring ArgoCD settings"

# Enable insecure mode (no TLS) and proxy extensions
kubectl -n "${ARGOCD_NS}" patch configmap argocd-cmd-params-cm --type merge \
    -p '{"data":{"server.insecure":"true","server.enable.proxy.extension":"true"}}' \
    2>/dev/null || \
    kubectl -n "${ARGOCD_NS}" create configmap argocd-cmd-params-cm \
        --from-literal=server.insecure=true \
        --from-literal=server.enable.proxy.extension=true

# Dev-friendly settings + custom CSS URL
kubectl -n "${ARGOCD_NS}" patch configmap argocd-cm --type merge \
    -p '{"data":{"exec.enabled":"true","statusbadge.enabled":"true","ui.cssurl":"./custom/argoplane.css"}}' \
    2>/dev/null || \
    kubectl -n "${ARGOCD_NS}" create configmap argocd-cm \
        --from-literal=exec.enabled=true \
        --from-literal=statusbadge.enabled=true \
        --from-literal=ui.cssurl=./custom/argoplane.css

# Grant extension invoke permissions (required in ArgoCD v3)
log "Configuring extension RBAC"

# Build RBAC policy from the list of extensions
RBAC_LINES=""
for ext in ${EXTENSIONS}; do
    RBAC_LINES="${RBAC_LINES}p, role:admin, extensions, invoke, ${ext}, allow\n"
done

kubectl -n "${ARGOCD_NS}" patch configmap argocd-rbac-cm --type merge \
    -p "{\"data\":{\"policy.csv\":\"${RBAC_LINES}\",\"policy.default\":\"role:admin\"}}" \
    2>/dev/null || \
    kubectl -n "${ARGOCD_NS}" create configmap argocd-rbac-cm \
        --from-literal=policy.csv="$(printf '%b' "${RBAC_LINES}")" \
        --from-literal=policy.default=role:admin

# ---------------------------------------------------------------------------
# Step 2: Deploy extension backends
# ---------------------------------------------------------------------------

log "Deploying extension backends"
for ext in ${EXTENSIONS}; do
    local_manifest="${PROJECT_ROOT}/deploy/extensions/${ext}/deployment.yaml"
    if [ -f "$local_manifest" ]; then
        log "  Deploying ${ext} backend"
        kubectl apply -f "$local_manifest"
    else
        warn "No deployment manifest for ${ext} at ${local_manifest}"
    fi
done

# Restart backends to pick up new images (idempotent, ignores missing deployments)
for ext in ${EXTENSIONS}; do
    kubectl -n "${ARGOCD_NS}" rollout restart deployment "argoplane-${ext}-backend" 2>/dev/null || true
done

# ---------------------------------------------------------------------------
# Step 3: Configure proxy extensions (routes /extensions/<name>/* to backends)
# ---------------------------------------------------------------------------

log "Configuring ArgoCD proxy extensions"
kubectl -n "${ARGOCD_NS}" patch cm argocd-cm --type merge \
    --patch-file "${PROJECT_ROOT}/deploy/argocd/proxy-extensions.json"

# ---------------------------------------------------------------------------
# Step 4: Install custom styles
# ---------------------------------------------------------------------------

log "Installing ArgoPlane custom styles"
kubectl -n "${ARGOCD_NS}" create configmap argocd-styles-cm \
    --from-file=argoplane.css="${PROJECT_ROOT}/deploy/argocd/argoplane-styles.css" \
    --from-file=login-wallpaper.jpg="${PROJECT_ROOT}/deploy/argocd/login-wallpaper.jpg" \
    --dry-run=client -o yaml | kubectl apply --server-side -f -

# Patch argocd-server to mount the custom styles volume (idempotent)
log "Mounting custom styles into argocd-server"
kubectl -n "${ARGOCD_NS}" patch deployment argocd-server --type json -p '[
  {
    "op": "add",
    "path": "/spec/template/spec/volumes/-",
    "value": {
      "name": "custom-styles",
      "configMap": {
        "name": "argocd-styles-cm"
      }
    }
  },
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/volumeMounts/-",
    "value": {
      "name": "custom-styles",
      "mountPath": "/shared/app/custom"
    }
  }
]' 2>/dev/null || log "Custom styles volume already mounted"

# ---------------------------------------------------------------------------
# Step 5: Configure repository credentials
# ---------------------------------------------------------------------------

log "Configuring repository credentials"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$GITHUB_TOKEN" ] && command -v gh &>/dev/null; then
    GITHUB_TOKEN="$(gh auth token 2>/dev/null || true)"
fi

if [ -n "$GITHUB_TOKEN" ]; then
    kubectl -n "${ARGOCD_NS}" apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: argoplane-repo-creds
  namespace: ${ARGOCD_NS}
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://github.com/natrontech/argoplane.git
  username: argocd
  password: ${GITHUB_TOKEN}
EOF
    log "Repository credentials configured (GitHub token)"
else
    warn "No GitHub token found. Set GITHUB_TOKEN or authenticate with 'gh auth login'."
    warn "The demo app will fail to sync without repo access."
fi

# ---------------------------------------------------------------------------
# Step 6: Restart argocd-server (ONE restart for all config changes)
# ---------------------------------------------------------------------------

log "Restarting argocd-server to pick up all configuration changes"
kubectl -n "${ARGOCD_NS}" rollout restart deployment argocd-server

# Wait for the new pod to be fully Ready
wait_for_rollout "${ARGOCD_NS}" argocd-server 180
ARGOCD_POD=$(wait_for_pod "${ARGOCD_NS}" "app.kubernetes.io/name=argocd-server" 120)
log "argocd-server pod ready: ${ARGOCD_POD}"

# ---------------------------------------------------------------------------
# Step 7: Load UI extension bundles + branding into argocd-server pod
# ---------------------------------------------------------------------------

log "Loading UI extension bundles into argocd-server"
kubectl exec -n "${ARGOCD_NS}" "${ARGOCD_POD}" -c argocd-server -- mkdir -p /tmp/extensions

for ext in ${EXTENSIONS} ${UI_ONLY_EXTENSIONS}; do
    local_bundle="${PROJECT_ROOT}/extensions/${ext}/ui/dist/extension-${ext}.js"
    if [ -f "$local_bundle" ]; then
        log "  Loading ${ext} UI bundle"
        kubectl cp "$local_bundle" \
            "${ARGOCD_NS}/${ARGOCD_POD}:/tmp/extensions/extension-${ext}.js" \
            -c argocd-server
    else
        warn "UI bundle not found for ${ext} at ${local_bundle} (run 'make build-extensions' first)"
    fi
done

# Install branding link extension
BRANDING_JS="${PROJECT_ROOT}/deploy/argocd/argoplane-links.js"
if [ -f "$BRANDING_JS" ]; then
    log "  Loading branding link extension"
    kubectl cp "$BRANDING_JS" \
        "${ARGOCD_NS}/${ARGOCD_POD}:/tmp/extensions/extension-argoplane-links.js" \
        -c argocd-server
fi

# ---------------------------------------------------------------------------
# Step 8: Print access info
# ---------------------------------------------------------------------------

ADMIN_PASSWORD=$(kubectl -n "${ARGOCD_NS}" get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" 2>/dev/null | base64 -d) || true

echo ""
log "ArgoCD setup complete!"
log "Extensions deployed: ${EXTENSIONS}"
if [ -n "${ADMIN_PASSWORD}" ]; then
    log "Username: admin"
    log "Password: ${ADMIN_PASSWORD}"
fi
log "Run 'make argocd-portforward' to access the UI"
