#!/usr/bin/env bash
set -euo pipefail

ARGOCD_NS="${ARGOCD_NS:-argocd}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() { echo "==> $*"; }

log "Configuring ArgoCD for local development"

# Enable insecure mode (no TLS) and proxy extensions
# Use patch to merge into existing ConfigMap rather than replacing it
kubectl -n "${ARGOCD_NS}" patch configmap argocd-cmd-params-cm --type merge \
    -p '{"data":{"server.insecure":"true","server.enable.proxy.extension":"true"}}' \
    2>/dev/null || \
    kubectl -n "${ARGOCD_NS}" create configmap argocd-cmd-params-cm \
        --from-literal=server.insecure=true \
        --from-literal=server.enable.proxy.extension=true

# Dev-friendly settings + custom CSS URL (merge into existing argocd-cm)
# Note: ArgoCD v3 uses annotation-based tracking by default (no instanceLabelKey needed)
kubectl -n "${ARGOCD_NS}" patch configmap argocd-cm --type merge \
    -p '{"data":{"exec.enabled":"true","statusbadge.enabled":"true","ui.cssurl":"./custom/argoplane.css"}}' \
    2>/dev/null || \
    kubectl -n "${ARGOCD_NS}" create configmap argocd-cm \
        --from-literal=exec.enabled=true \
        --from-literal=statusbadge.enabled=true \
        --from-literal=ui.cssurl=./custom/argoplane.css

# Create ConfigMap from the ArgoPlane custom stylesheet
log "Installing ArgoPlane custom styles"
kubectl -n "${ARGOCD_NS}" create configmap argocd-styles-cm \
    --from-file=argoplane.css="${PROJECT_ROOT}/deploy/argocd/argoplane-styles.css" \
    --dry-run=client -o yaml | kubectl apply -f -

# Patch argocd-server to mount the custom styles volume
# This is idempotent: if the volume already exists, the patch is a no-op
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

# Configure private repo access for the demo app
# Uses GITHUB_TOKEN env var, or falls back to gh CLI auth
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
    log "WARNING: No GitHub token found. Set GITHUB_TOKEN or authenticate with 'gh auth login'."
    log "         The demo app will fail to sync without repo access."
fi

# Grant extension invoke permissions (required in ArgoCD v3)
log "Configuring extension RBAC"
kubectl -n "${ARGOCD_NS}" patch configmap argocd-rbac-cm --type merge \
    -p '{"data":{"policy.csv":"p, role:admin, extensions, invoke, metrics, allow\np, role:admin, extensions, invoke, backups, allow\np, role:admin, extensions, invoke, networking, allow\n","policy.default":"role:admin"}}' \
    2>/dev/null || \
    kubectl -n "${ARGOCD_NS}" create configmap argocd-rbac-cm \
        --from-literal=policy.csv="$(printf 'p, role:admin, extensions, invoke, metrics, allow\np, role:admin, extensions, invoke, backups, allow\np, role:admin, extensions, invoke, networking, allow\n')" \
        --from-literal=policy.default=role:admin

# Restart argocd-server to pick up all changes
kubectl -n "${ARGOCD_NS}" rollout restart deployment argocd-server
kubectl -n "${ARGOCD_NS}" rollout status deployment argocd-server --timeout=180s

# Print access info
ADMIN_PASSWORD=$(kubectl -n "${ARGOCD_NS}" get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" 2>/dev/null | base64 -d) || true

if [ -n "${ADMIN_PASSWORD}" ]; then
    log "ArgoCD configured with ArgoPlane styles"
    log "Username: admin"
    log "Password: ${ADMIN_PASSWORD}"
    log "Run 'make argocd-portforward' to access the UI"
else
    log "ArgoCD configured. Initial admin secret not found (may have been deleted)."
fi
