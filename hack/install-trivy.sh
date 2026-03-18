#!/usr/bin/env bash
set -euo pipefail

log() { echo "==> $*"; }

log "Installing Trivy Operator"
helm repo add aqua https://aquasecurity.github.io/helm-charts 2>/dev/null || true
helm repo update

helm upgrade --install trivy-operator aqua/trivy-operator \
    --namespace trivy-system --create-namespace \
    --set trivy.slow=true \
    --set operator.scanJobsConcurrentLimit=3 \
    --set operator.vulnerabilityScannerEnabled=true \
    --set operator.configAuditScannerEnabled=false \
    --set operator.sbomGenerationEnabled=false \
    --set operator.exposedSecretScannerEnabled=false \
    --wait --timeout 180s

log "Trivy Operator installed"
