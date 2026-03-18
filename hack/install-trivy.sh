#!/usr/bin/env bash
set -euo pipefail

log() { echo "==> $*"; }

log "Installing Trivy Operator"
helm repo add aqua https://aquasecurity.github.io/helm-charts 2>/dev/null || true
helm repo update

helm upgrade --install trivy-operator aqua/trivy-operator \
    --namespace trivy-system --create-namespace \
    --set trivy.command=image \
    --set operator.scanJobsConcurrentLimit=1 \
    --set operator.vulnerabilityScannerEnabled=true \
    --set operator.configAuditScannerEnabled=false \
    --set operator.sbomGenerationEnabled=false \
    --set operator.exposedSecretScannerEnabled=false \
    --set operator.scanJobsInSameNamespace=true \
    --set trivyOperator.scanJobCompressLogs=false \
    --wait --timeout 180s

log "Trivy Operator installed"
