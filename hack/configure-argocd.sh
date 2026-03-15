#!/usr/bin/env bash
set -euo pipefail

ARGOCD_NS="${ARGOCD_NS:-argocd}"

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

# Dev-friendly settings (merge into existing argocd-cm)
# Note: ArgoCD v3 uses annotation-based tracking by default (no instanceLabelKey needed)
kubectl -n "${ARGOCD_NS}" patch configmap argocd-cm --type merge \
    -p '{"data":{"exec.enabled":"true","statusbadge.enabled":"true"}}' \
    2>/dev/null || \
    kubectl -n "${ARGOCD_NS}" create configmap argocd-cm \
        --from-literal=exec.enabled=true \
        --from-literal=statusbadge.enabled=true

# Restart argocd-server to pick up ConfigMap changes
kubectl -n "${ARGOCD_NS}" rollout restart deployment argocd-server
kubectl -n "${ARGOCD_NS}" rollout status deployment argocd-server --timeout=180s

# Print access info
ADMIN_PASSWORD=$(kubectl -n "${ARGOCD_NS}" get secret argocd-initial-admin-secret \
    -o jsonpath="{.data.password}" 2>/dev/null | base64 -d) || true

if [ -n "${ADMIN_PASSWORD}" ]; then
    log "ArgoCD configured for local development"
    log "Username: admin"
    log "Password: ${ADMIN_PASSWORD}"
    log "Run 'make argocd-portforward' to access the UI"
else
    log "ArgoCD configured. Initial admin secret not found (may have been deleted)."
fi
