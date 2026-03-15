#!/usr/bin/env bash
# Deploy the ArgoPlane demo application for manual/visual testing.
# All resources (guestbook + network policy + velero schedule) are managed
# by ArgoCD via the manifests in examples/demo-app/manifests/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_DIR="$REPO_ROOT/examples/demo-app"

echo "==> Creating ArgoCD Application (all demo resources tracked by ArgoCD)"
kubectl apply -f "$DEMO_DIR/argocd-application.yaml"

echo "==> Waiting for application to sync..."
kubectl -n argocd wait application/argoplane-demo \
  --for=jsonpath='{.status.sync.status}'=Synced --timeout=120s 2>/dev/null || \
  echo "    (sync in progress, check ArgoCD UI)"

echo ""
echo "==> Demo app deployed!"
echo "    Open ArgoCD UI -> click 'argoplane-demo' -> click 'guestbook-ui' Deployment"
echo "    You should see: Metrics tab, Networking tab, Backups status panel"
echo "    The CiliumNetworkPolicy is now visible in the app's resource tree."
