#!/usr/bin/env bash
set -euo pipefail

log() { echo "==> $*"; }

log "Installing Trivy Operator"
helm repo add aqua https://aquasecurity.github.io/helm-charts 2>/dev/null || true
helm repo update

# Write a temporary values file to avoid Helm --set comma escaping issues.
VALUES_FILE=$(mktemp)
trap "rm -f ${VALUES_FILE}" EXIT

cat > "${VALUES_FILE}" <<'EOF'
# Exclude namespaces with local-only dev images (kind-loaded, not pullable from registries)
# and system namespaces. The demo app namespace uses public images and will be scanned.
excludeNamespaces: "kube-system,trivy-system,argocd,velero,monitoring,kube-node-lease,kube-public,local-path-storage"

trivy:
  command: image
  resources:
    requests:
      memory: 256Mi
    limits:
      memory: 512Mi

# Scanner toggles and concurrency live under operator.* (env vars on the deployment).
operator:
  scanJobsConcurrentLimit: 1
  vulnerabilityScannerEnabled: true
  configAuditScannerEnabled: true
  sbomGenerationEnabled: false
  exposedSecretScannerEnabled: false
  # Disable infra assessment and compliance (triggers node-collector pods that
  # can't schedule on tainted control-plane nodes in kind clusters).
  infraAssessmentScannerEnabled: false
  clusterComplianceEnabled: false

# Scan job behavior lives under trivyOperator.* (ConfigMap entries).
trivyOperator:
  # Run scan jobs in trivy-system (not workload namespace) to avoid Cilium
  # network policies blocking egress to container registries and Trivy DB mirrors.
  scanJobsInSameNamespace: false
  scanJobCompressLogs: false
EOF

helm upgrade --install trivy-operator aqua/trivy-operator \
    --namespace trivy-system --create-namespace \
    -f "${VALUES_FILE}" \
    --wait --timeout 180s

log "Trivy Operator installed"
