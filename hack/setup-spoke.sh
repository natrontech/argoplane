#!/usr/bin/env bash
# Optional second cluster, for exercising the multi-cluster path end to end.
#
# The default local setup is a single cluster, where ArgoCD manages itself and
# every backend reads the cluster it runs on. That never exercises the hub-spoke
# case: Application CRs live beside ArgoCD, while the reports describing a
# workload live on the cluster running it. This script builds that split so the
# vulnerabilities backend has to resolve a client for another cluster.
#
# Everything here is idempotent, and nothing touches the hub beyond adding one
# cluster Secret and one Application.
#
#   make dev-infra-multicluster   # hub + spoke
#   make spoke                    # add a spoke to an existing hub
#   make spoke-delete             # remove just the spoke
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

REPO_ROOT="$(repo_root)"
HUB_CLUSTER="${CLUSTER_NAME:-argoplane-dev}"
SPOKE_CLUSTER="${SPOKE_CLUSTER_NAME:-argoplane-dev-spoke}"
HUB_CTX="kind-${HUB_CLUSTER}"
SPOKE_CTX="kind-${SPOKE_CLUSTER}"
ARGOCD_NS="${ARGOCD_NS:-argocd}"
# Deliberately not argoplane-demo, which the hub's own demo app uses. Sharing
# it would mean a backend reading the wrong cluster still found reports with
# the right names, so the setup would look healthy while proving nothing.
SPOKE_DEMO_NS="argoplane-demo-spoke"

kind get clusters 2>/dev/null | grep -qx "${HUB_CLUSTER}" \
    || die "hub cluster '${HUB_CLUSTER}' not found. Run 'make dev-infra' first."

# --- 1. spoke cluster -------------------------------------------------------

if kind get clusters 2>/dev/null | grep -qx "${SPOKE_CLUSTER}"; then
    log "Spoke cluster '${SPOKE_CLUSTER}' already exists"
else
    log "Creating spoke cluster '${SPOKE_CLUSTER}'"
    kind create cluster --name "${SPOKE_CLUSTER}" \
        --config "${REPO_ROOT}/hack/kind-config-spoke.yaml"
fi

# kind switches the current context on create; the hub is what the rest of the
# tooling expects, so put it back before doing anything else.
kubectl config use-context "${HUB_CTX}" >/dev/null

# --- 2. Trivy Operator on the spoke ----------------------------------------

log "Installing Trivy Operator on the spoke"
helm repo add aqua https://aquasecurity.github.io/helm-charts 2>/dev/null || true
helm repo update aqua >/dev/null

SPOKE_VALUES=$(mktemp)
trap 'rm -f "${SPOKE_VALUES}"' EXIT
cat > "${SPOKE_VALUES}" <<'EOF'
excludeNamespaces: "kube-system,trivy-system,kube-node-lease,kube-public,local-path-storage"

trivy:
  command: image
  resources:
    requests:
      memory: 256Mi
    limits:
      memory: 512Mi

operator:
  scanJobsConcurrentLimit: 5
  vulnerabilityScannerEnabled: true
  configAuditScannerEnabled: true
  sbomGenerationEnabled: true
  exposedSecretScannerEnabled: true
  # Both spawn node-collector pods that cannot schedule on a kind
  # control-plane node, same as on the hub.
  infraAssessmentScannerEnabled: false
  clusterComplianceEnabled: false
EOF

helm --kube-context "${SPOKE_CTX}" upgrade --install trivy-operator aqua/trivy-operator \
    --namespace trivy-system --create-namespace \
    -f "${SPOKE_VALUES}" \
    --wait --timeout 300s

# --- 3. credentials the hub can use ----------------------------------------

log "Creating the ArgoCD service account on the spoke"
kubectl --context "${SPOKE_CTX}" apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-manager
  namespace: kube-system
---
# A non-expiring token. 'kubectl create token' would be the modern choice, but
# its tokens expire and a dev cluster is expected to survive a weekend.
apiVersion: v1
kind: Secret
metadata:
  name: argocd-manager-token
  namespace: kube-system
  annotations:
    kubernetes.io/service-account.name: argocd-manager
type: kubernetes.io/service-account-token
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: argocd-manager
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: argocd-manager
    namespace: kube-system
EOF

log "Waiting for the token to be populated"
for _ in $(seq 1 30); do
    TOKEN=$(kubectl --context "${SPOKE_CTX}" -n kube-system get secret argocd-manager-token \
        -o jsonpath='{.data.token}' 2>/dev/null | base64 -d 2>/dev/null || true)
    [ -n "${TOKEN:-}" ] && break
    sleep 1
done
[ -n "${TOKEN:-}" ] || die "service account token was never populated on the spoke"

# The hub reaches the spoke over the shared kind Docker network, so the address
# has to be the container's IP there. The kubeconfig points at 127.0.0.1, which
# from inside a hub pod is the pod itself.
SPOKE_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
    "${SPOKE_CLUSTER}-control-plane" 2>/dev/null || true)
[ -n "${SPOKE_IP}" ] || die "could not find the spoke container's IP on the kind network"
SPOKE_SERVER="https://${SPOKE_IP}:6443"
log "Spoke API server reachable from the hub at ${SPOKE_SERVER}"

# --- 4. register the spoke with ArgoCD on the hub --------------------------

# insecure: true is a dev shortcut. kind's API server certificate does not carry
# the container IP as a SAN, and generating one is not worth it for a local
# cluster that exists to prove the lookup path works.
log "Registering the spoke as an ArgoCD cluster"
kubectl --context "${HUB_CTX}" apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SPOKE_CLUSTER}
  namespace: ${ARGOCD_NS}
  labels:
    argocd.argoproj.io/secret-type: cluster
type: Opaque
stringData:
  name: ${SPOKE_CLUSTER}
  server: ${SPOKE_SERVER}
  config: |
    {
      "bearerToken": "${TOKEN}",
      "tlsClientConfig": { "insecure": true }
    }
EOF

# --- 5. let the backend read cluster Secrets, and turn the lookup on --------

# Both belong here rather than in deploy/extensions/vulnerabilities: a
# single-cluster dev setup neither needs the grant nor the lookup, and should
# not be handed Secret access it never uses.
log "Granting the vulnerabilities backend read access to cluster Secrets"
kubectl --context "${HUB_CTX}" apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: argoplane-vulnerabilities-clusters
  namespace: ${ARGOCD_NS}
  labels:
    app.kubernetes.io/name: argoplane-vulnerabilities-backend
    app.kubernetes.io/part-of: argoplane
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: argoplane-vulnerabilities-clusters
  namespace: ${ARGOCD_NS}
  labels:
    app.kubernetes.io/name: argoplane-vulnerabilities-backend
    app.kubernetes.io/part-of: argoplane
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: argoplane-vulnerabilities-clusters
subjects:
  - kind: ServiceAccount
    name: argoplane-vulnerabilities-backend
    namespace: ${ARGOCD_NS}
EOF

# Without this the backend reads its own cluster, so the spoke app's tab would
# show the hub's reports instead of the spoke's.
log "Enabling the multi-cluster lookup on the vulnerabilities backend"
if kubectl --context "${HUB_CTX}" -n "${ARGOCD_NS}" get deploy argoplane-vulnerabilities-backend >/dev/null 2>&1; then
    kubectl --context "${HUB_CTX}" -n "${ARGOCD_NS}" set env \
        deploy/argoplane-vulnerabilities-backend MULTI_CLUSTER=true
    kubectl --context "${HUB_CTX}" -n "${ARGOCD_NS}" rollout status \
        deploy/argoplane-vulnerabilities-backend --timeout=120s
else
    warn "argoplane-vulnerabilities-backend is not deployed yet."
    warn "Run 'make setup-argocd', then re-run 'make spoke' to enable the lookup."
fi

# --- 6. an Application that actually targets the spoke ---------------------

# Addressed by name rather than server on purpose: ArgoCD only sets
# Argocd-Target-Cluster-URL when an Application sets spec.destination.server,
# so a name-addressed destination is the case a backend reading that header
# would get wrong.
log "Creating a demo Application targeting the spoke"
kubectl --context "${HUB_CTX}" apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: argoplane-demo-spoke
  namespace: ${ARGOCD_NS}
  labels:
    app.kubernetes.io/part-of: argoplane-demo
spec:
  project: default
  source:
    repoURL: https://github.com/natrontech/argoplane.git
    targetRevision: HEAD
    path: examples/demo-app/spoke
  destination:
    name: ${SPOKE_CLUSTER}
    namespace: ${SPOKE_DEMO_NS}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - RespectNamespace=true
EOF

log "Waiting for the spoke application to sync..."
kubectl --context "${HUB_CTX}" -n "${ARGOCD_NS}" wait application/argoplane-demo-spoke \
    --for=jsonpath='{.status.sync.status}'=Synced --timeout=180s 2>/dev/null || \
    echo "    (sync in progress, check the ArgoCD UI)"

echo ""
log "Multi-cluster dev setup ready"
echo ""
echo "    hub    ${HUB_CTX}     ArgoCD, extension backends"
echo "    spoke  ${SPOKE_CTX}   workloads + Trivy reports"
echo ""
echo "    Open the ArgoCD UI and pick 'argoplane-demo-spoke'. Its Vulnerabilities"
echo "    tab reads reports from the spoke, which only works if the backend"
echo "    resolves a client for the Application's destination instead of using"
echo "    its own in-cluster client."
echo ""
echo "    Trivy needs a few minutes to scan before reports appear:"
echo "      kubectl --context ${SPOKE_CTX} get vulnerabilityreports -n ${SPOKE_DEMO_NS}"
echo ""
echo "    'argoplane-demo' (single-cluster, namespace argoplane-demo) keeps"
echo "    working unchanged, so both paths are visible side by side."
echo ""
echo "    The two apps deliberately use different namespaces: a backend reading"
echo "    the wrong cluster finds nothing rather than the other app's reports,"
echo "    so a misconfiguration shows up as an empty tab instead of passing."
echo ""
