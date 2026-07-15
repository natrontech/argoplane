#!/usr/bin/env bash
# Deploy the ArgoPlane demo application for manual/visual testing.
# All resources (guestbook + network policy + traffic generators)
# are managed by ArgoCD via the manifests in examples/demo-app/manifests/.
#
# For local dev (before pushing to remote), this script also applies manifests
# directly so you don't have to wait for a git push + ArgoCD sync.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

REPO_ROOT="$(repo_root)"
DEMO_DIR="$REPO_ROOT/examples/demo-app"

log "Creating namespaces (if needed)"
kubectl create namespace argoplane-demo 2>/dev/null || true

log "Applying demo manifests directly (local dev)"
kubectl apply -f "$DEMO_DIR/manifests/"

log "Applying platform-managed policies (clusterwide + namespace)"
kubectl apply -f "$DEMO_DIR/platform-policies.yaml"

log "Applying cross-namespace traffic generator"
kubectl apply -f "$DEMO_DIR/cross-namespace-traffic.yaml"

log "Creating ArgoCD Application"
kubectl apply -f "$DEMO_DIR/argocd-application.yaml"

log "Waiting for application to sync..."
kubectl -n argocd wait application/argoplane-demo \
  --for=jsonpath='{.status.sync.status}'=Synced --timeout=120s 2>/dev/null || \
  echo "    (sync in progress, check ArgoCD UI)"

echo ""
log "Demo app deployed!"
echo "    Open ArgoCD UI -> click 'argoplane-demo' -> click 'guestbook-ui' Deployment"
echo ""
echo "    App-owned resources (in ArgoCD tree):"
echo "      guestbook-ui              Deployment           (serves HTTP on port 80)"
echo "      traffic-allowed           Deployment           (curls guestbook every 3s, FORWARDED)"
echo "      traffic-blocked           Deployment           (curls guestbook every 5s, DROPPED)"
echo "      guestbook-policy          CiliumNetworkPolicy  (restricts ingress to role=frontend-client)"
echo "      traffic-generator-egress  CiliumNetworkPolicy  (restricts traffic-allowed egress)"
echo ""
echo "    Platform-managed resources (NOT in ArgoCD tree, show as 'platform' ownership):"
echo "      platform-default-deny-ingress   CiliumClusterwideNetworkPolicy  (baseline deny-all ingress)"
echo "      platform-allow-dns              CiliumClusterwideNetworkPolicy  (baseline allow DNS)"
echo "      platform-allow-health-probes    CiliumClusterwideNetworkPolicy  (allow kubelet probes)"
echo "      platform-allow-monitoring       CiliumNetworkPolicy             (allow monitoring scraping)"
echo "      platform-restrict-cross-ns      CiliumNetworkPolicy             (allow intra-namespace)"
echo ""
echo "    Cross-namespace traffic (separate namespace):"
echo "      other-team/cross-ns-client      Deployment  (curls guestbook every 10s, DROPPED)"
echo ""
echo "    Extensions visible:"
echo "      Networking tab   on app view (flows + policies + allowed traffic)"
echo "      Metrics tab      on guestbook-ui Deployment"
