#!/usr/bin/env bash
set -euo pipefail

CILIUM_VERSION="${CILIUM_VERSION:-1.19.1}"

echo "==> Installing Cilium ${CILIUM_VERSION}"

helm repo add cilium https://helm.cilium.io/ 2>/dev/null || true
helm repo update cilium

# Preload Cilium image into kind for faster startup
echo "==> Preloading Cilium image into kind"
docker pull "quay.io/cilium/cilium:v${CILIUM_VERSION}" 2>/dev/null || true
kind load docker-image "quay.io/cilium/cilium:v${CILIUM_VERSION}" --name "${CLUSTER_NAME:-argoplane-dev}"

helm upgrade --install cilium cilium/cilium \
    --version "${CILIUM_VERSION}" \
    --namespace kube-system \
    --set image.pullPolicy=IfNotPresent \
    --set ipam.mode=kubernetes \
    --set hubble.relay.enabled=true \
    --set hubble.ui.enabled=true \
    --set hubble.enabled=true \
    --set hubble.metrics.enableOpenMetrics=true \
    --set hubble.metrics.enabled="{dns,drop,tcp,flow,port-distribution,icmp,httpV2:exemplars=true;labelsContext=source_ip\,source_namespace\,source_workload\,destination_ip\,destination_namespace\,destination_workload\,traffic_direction}" \
    --wait --timeout 180s

echo "==> Waiting for Cilium to be ready"
kubectl -n kube-system rollout status daemonset cilium --timeout=180s
kubectl -n kube-system rollout status deployment cilium-operator --timeout=120s

echo "==> Waiting for nodes to become Ready"
kubectl wait --for=condition=Ready nodes --all --timeout=120s

echo "==> Cilium installed successfully"
