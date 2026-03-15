#!/usr/bin/env bash
# Deploy the ArgoPlane demo application for manual/visual testing.
# All resources (guestbook + network policy + traffic generators + velero schedule)
# are managed by ArgoCD via the manifests in examples/demo-app/manifests/.
#
# For local dev (before pushing to remote), this script also applies manifests
# directly so you don't have to wait for a git push + ArgoCD sync.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_DIR="$REPO_ROOT/examples/demo-app"

echo "==> Creating namespace (if needed)"
kubectl create namespace argoplane-demo 2>/dev/null || true

echo "==> Applying demo manifests directly (local dev)"
kubectl apply -f "$DEMO_DIR/manifests/" -n argoplane-demo

echo "==> Creating ArgoCD Application"
kubectl apply -f "$DEMO_DIR/argocd-application.yaml"

echo "==> Waiting for application to sync..."
kubectl -n argocd wait application/argoplane-demo \
  --for=jsonpath='{.status.sync.status}'=Synced --timeout=120s 2>/dev/null || \
  echo "    (sync in progress, check ArgoCD UI)"

echo ""
echo "==> Demo app deployed!"
echo "    Open ArgoCD UI -> click 'argoplane-demo' -> click 'guestbook-ui' Deployment"
echo ""
echo "    Resources:"
echo "      guestbook-ui          Deployment   (serves HTTP on port 80)"
echo "      traffic-allowed       Deployment   (curls guestbook every 3s, FORWARDED)"
echo "      traffic-blocked       Deployment   (curls guestbook every 5s, DROPPED)"
echo "      guestbook-policy      CiliumNetworkPolicy (restricts ingress to role=frontend-client)"
echo "      argoplane-demo-daily  Velero Schedule"
echo ""
echo "    Extensions visible:"
echo "      Metrics tab      on guestbook-ui Deployment"
echo "      Networking tab   on guestbook-ui Deployment (shows forwarded + dropped flows)"
echo "      Backups panel    on argoplane-demo Application"
