#!/usr/bin/env bash
set -euo pipefail

MONITORING_NS="monitoring"

log() { echo "==> $*"; }

log "Installing Loki + Promtail for log aggregation"

# Add Grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
helm repo update

# Install Loki in single-binary mode (lightweight, dev-friendly)
log "Installing Loki (single-binary mode)"
helm upgrade --install loki grafana/loki \
    --namespace "${MONITORING_NS}" --create-namespace \
    --set deploymentMode=SingleBinary \
    --set singleBinary.replicas=1 \
    --set loki.auth_enabled=false \
    --set loki.commonConfig.replication_factor=1 \
    --set loki.storage.type=filesystem \
    --set "loki.schemaConfig.configs[0].from=2024-01-01" \
    --set "loki.schemaConfig.configs[0].store=tsdb" \
    --set "loki.schemaConfig.configs[0].object_store=filesystem" \
    --set "loki.schemaConfig.configs[0].schema=v13" \
    --set "loki.schemaConfig.configs[0].index.prefix=index_" \
    --set "loki.schemaConfig.configs[0].index.period=24h" \
    --set singleBinary.resources.requests.memory=256Mi \
    --set singleBinary.resources.limits.memory=512Mi \
    --set chunksCache.enabled=false \
    --set resultsCache.enabled=false \
    --set lokiCanary.enabled=false \
    --set test.enabled=false \
    --set gateway.enabled=false \
    --set backend.replicas=0 \
    --set read.replicas=0 \
    --set write.replicas=0 \
    --wait --timeout 180s

# Install Promtail to ship pod logs to Loki
log "Installing Promtail (log shipper)"
helm upgrade --install promtail grafana/promtail \
    --namespace "${MONITORING_NS}" \
    --set "config.clients[0].url=http://loki.${MONITORING_NS}.svc:3100/loki/api/v1/push" \
    --wait --timeout 120s

log "Loki + Promtail installed in namespace '${MONITORING_NS}'"
log "Loki API: http://loki.${MONITORING_NS}.svc:3100"
