#!/usr/bin/env bash
set -euo pipefail

log() { echo "==> $*"; }

log "Installing Trivy Operator"
helm repo add aqua https://aquasecurity.github.io/helm-charts 2>/dev/null || true
helm repo update

# Exclude namespaces with local-only dev images (kind-loaded, not pullable)
# and system namespaces whose images are also not always pullable.
# The demo app namespace (argoplane-demo) uses public registry images and will be scanned.
EXCLUDE_NS="kube-system,trivy-system,argocd,velero,monitoring,kube-node-lease,kube-public,local-path-storage"

helm upgrade --install trivy-operator aqua/trivy-operator \
    --namespace trivy-system --create-namespace \
    --set trivy.command=image \
    --set "operator.excludeNamespaces={${EXCLUDE_NS}}" \
    --set operator.scanJobsConcurrentLimit=1 \
    --set operator.vulnerabilityScannerEnabled=true \
    --set operator.configAuditScannerEnabled=false \
    --set operator.sbomGenerationEnabled=false \
    --set operator.exposedSecretScannerEnabled=false \
    --set operator.scanJobsInSameNamespace=true \
    --set trivyOperator.scanJobCompressLogs=false \
    --set trivy.resources.requests.memory=256Mi \
    --set trivy.resources.limits.memory=512Mi \
    --wait --timeout 180s

log "Trivy Operator installed"
