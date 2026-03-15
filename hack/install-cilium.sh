#!/usr/bin/env bash
set -euo pipefail

CILIUM_VERSION="${CILIUM_VERSION:-1.19.1}"

echo "==> Installing Cilium ${CILIUM_VERSION}"

helm repo add cilium https://helm.cilium.io/ 2>/dev/null || true
helm repo update cilium

helm upgrade --install cilium cilium/cilium \
    --version "${CILIUM_VERSION}" \
    --namespace kube-system \
    --set ipam.mode=kubernetes \
    --set hubble.enabled=true \
    --wait --timeout 300s

echo "==> Waiting for Cilium to be ready"
kubectl -n kube-system rollout status daemonset cilium --timeout=180s
kubectl -n kube-system rollout status deployment cilium-operator --timeout=120s

echo "==> Waiting for nodes to become Ready"
kubectl wait --for=condition=Ready nodes --all --timeout=120s

echo "==> Cilium installed successfully"
