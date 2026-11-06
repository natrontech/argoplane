package handler

import (
	"context"
	"log/slog"
	"net/http"

	"k8s.io/client-go/dynamic"
)

// Clients resolves the client to read report CRs from, given the cluster an
// Application deploys to.
//
// Reports live on the cluster running the workload, while the Application CR
// that authorises the request lives on the hub. The Authorizer keeps using the
// hub's own client; everything that reads report data goes through here.
type Clients interface {
	For(ctx context.Context, serverURL string) (dynamic.Interface, error)
}

// clientFor picks the client for the cluster ArgoCD named on this request.
// ArgoCD sets Argocd-Target-Cluster-URL on every proxy-extension call; an empty
// value means the hub itself, which Clients resolves to its local client.
//
// It logs the cause here so every caller can stay a plain error check: a
// cluster Secret this backend cannot use would otherwise fail silently behind
// a generic HTTP error.
func clientFor(c Clients, r *http.Request) (dynamic.Interface, error) {
	server := r.Header.Get("Argocd-Target-Cluster-URL")
	client, err := c.For(r.Context(), server)
	if err != nil {
		slog.Error("failed to resolve target cluster",
			"error", err,
			"cluster_url", server,
			"cluster_name", r.Header.Get("Argocd-Target-Cluster-Name"),
			"app", r.Header.Get("Argocd-Application-Name"))
		return nil, err
	}
	return client, nil
}

// static serves one client for every cluster. Used by tests, and by any install
// where ArgoCD only manages its own cluster.
type static struct{ client dynamic.Interface }

// Static adapts a single client to the Clients interface.
func Static(client dynamic.Interface) Clients { return static{client: client} }

func (s static) For(context.Context, string) (dynamic.Interface, error) {
	return s.client, nil
}
