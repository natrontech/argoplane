#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MONITORING_NS="monitoring"

log "Installing Loki + Alloy for log aggregation"

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

# Install Alloy (replaces deprecated Promtail) to ship pod logs to Loki
log "Installing Alloy (log shipper)"
helm upgrade --install alloy grafana/alloy \
    --namespace "${MONITORING_NS}" \
    --set alloy.configMap.create=false \
    --wait --timeout 120s

# Create Alloy config to discover and ship pod logs to Loki
log "Configuring Alloy to ship logs to Loki"
kubectl -n "${MONITORING_NS}" apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: alloy
  namespace: monitoring
data:
  config.alloy: |
    // Discover Kubernetes pods
    discovery.kubernetes "pods" {
      role = "pod"
    }

    // Relabel to extract useful metadata
    discovery.relabel "pods" {
      targets = discovery.kubernetes.pods.targets

      rule {
        source_labels = ["__meta_kubernetes_pod_node_name"]
        target_label  = "__host__"
      }
      rule {
        source_labels = ["__meta_kubernetes_namespace"]
        target_label  = "namespace"
      }
      rule {
        source_labels = ["__meta_kubernetes_pod_name"]
        target_label  = "pod"
      }
      rule {
        source_labels = ["__meta_kubernetes_pod_container_name"]
        target_label  = "container"
      }
      rule {
        source_labels = ["__meta_kubernetes_pod_label_app_kubernetes_io_name"]
        target_label  = "app"
      }
    }

    // Collect logs from pod log files
    loki.source.kubernetes "pods" {
      targets    = discovery.relabel.pods.output
      forward_to = [loki.write.default.receiver]
    }

    // Write to Loki
    loki.write "default" {
      endpoint {
        url = "http://loki.monitoring.svc:3100/loki/api/v1/push"
      }
    }
EOF

# Restart Alloy to pick up the config
kubectl -n "${MONITORING_NS}" rollout restart daemonset alloy 2>/dev/null || true
kubectl -n "${MONITORING_NS}" rollout status daemonset alloy --timeout=120s 2>/dev/null || true

log "Loki + Alloy installed in namespace '${MONITORING_NS}'"
log "Loki API: http://loki.${MONITORING_NS}.svc:3100"
