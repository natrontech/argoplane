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
	For(ctx context.Context, clusterName, clusterServer string) (dynamic.Interface, error)
}

// clientFor resolves the client for the cluster this request's Application
// deploys to.
//
// The destination comes from the Application, never from a request header.
// ArgoCD only overwrites Argocd-Target-Cluster-URL when the Application sets
// spec.destination.server; an Application that names its destination instead
// leaves whatever the caller sent in place, which would let an authorised user
// read a namespace's reports on a cluster they have no access to.
func clientFor(c Clients, auth *Authorizer, r *http.Request) (dynamic.Interface, error) {
	name, server, err := auth.Destination(r.Context(), r)
	if err != nil {
		slog.Warn("security.rejected",
			"reason", "could not resolve the application's destination cluster",
			"error", err,
			"app", r.Header.Get("Argocd-Application-Name"))
		return nil, err
	}

	client, err := c.For(r.Context(), name, server)
	if err != nil {
		slog.Error("failed to resolve target cluster",
			"error", err,
			"cluster_name", name,
			"cluster_server", server,
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

func (s static) For(context.Context, string, string) (dynamic.Interface, error) {
	return s.client, nil
}
