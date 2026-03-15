#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-argoplane-dev}"

log() { echo "==> $*"; }

# Clean up test resources gracefully
if kubectl config use-context "kind-${CLUSTER_NAME}" 2>/dev/null; then
    log "Removing test applications..."
    kubectl delete applications -n argocd -l app.kubernetes.io/part-of=argoplane-test \
        --wait=true --timeout=60s 2>/dev/null || true

    log "Removing test namespaces..."
    kubectl delete ns argoplane-test --wait=false 2>/dev/null || true
fi

# Delete the kind cluster
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    log "Deleting kind cluster '${CLUSTER_NAME}'"
    kind delete cluster --name "${CLUSTER_NAME}"
else
    log "Cluster '${CLUSTER_NAME}' does not exist, nothing to delete"
fi

log "Teardown complete"
