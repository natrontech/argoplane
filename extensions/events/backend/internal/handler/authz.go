package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// applicationGVR identifies the ArgoCD Application custom resource.
var applicationGVR = schema.GroupVersionResource{Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"}

// validNamespace checks that a namespace value is a valid Kubernetes name
// to prevent injection of arbitrary strings into K8s API calls.
var validNamespace = regexp.MustCompile(`^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$`)

// validateNamespace checks the namespace is a valid Kubernetes namespace name.
// Returns false and writes an error response if invalid.
func validateNamespace(w http.ResponseWriter, namespace string) bool {
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return false
	}
	if len(namespace) > 63 || !validNamespace.MatchString(namespace) {
		WriteError(w, http.StatusBadRequest, "invalid namespace")
		return false
	}
	return true
}

// auditLog emits a structured security audit log entry for all data access.
func auditLog(r *http.Request, action, namespace string, extra ...any) {
	args := []any{
		"action", action,
		"namespace", namespace,
		"user", r.Header.Get("Argocd-Username"),
		"user_groups", r.Header.Get("Argocd-User-Groups"),
		"app", r.Header.Get("Argocd-Application-Name"),
		"project", r.Header.Get("Argocd-Project-Name"),
		"remote_addr", r.RemoteAddr,
	}
	args = append(args, extra...)
	slog.Info("security.audit", args...)
}

// Authorizer authorizes access to a namespace by checking whether it is
// managed by the ArgoCD Application the request originated from.
type Authorizer struct {
	client dynamic.Interface
	// clusterName and clusterServer identify the cluster this backend reads
	// from. Empty means "don't check" (single-cluster installs).
	clusterName   string
	clusterServer string
}

// AuthorizerOption configures an Authorizer.
type AuthorizerOption func(*Authorizer)

// WithCluster rejects Applications whose spec.destination names a different
// cluster than this backend serves. An app matches if its destination.name
// equals name or its destination.server equals server; empty values are
// ignored, and with both empty the check is off.
func WithCluster(name, server string) AuthorizerOption {
	return func(a *Authorizer) {
		a.clusterName = name
		a.clusterServer = strings.TrimSuffix(server, "/")
	}
}

// NewAuthorizer creates a new Authorizer backed by a dynamic client.
func NewAuthorizer(client dynamic.Interface, opts ...AuthorizerOption) *Authorizer {
	a := &Authorizer{client: client}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

// AuthorizeNamespace verifies the requested namespace is managed by the ArgoCD
// Application identified by the proxy headers. It writes an error response and
// returns false when access is denied.
func (a *Authorizer) AuthorizeNamespace(w http.ResponseWriter, r *http.Request, requested string) bool {
	appNs, appName, ok := appFromHeader(r)
	if !ok {
		WriteError(w, http.StatusForbidden, "request must come through ArgoCD proxy")
		return false
	}
	allowed, err := a.allowedNamespaces(r.Context(), appNs, appName)
	if err != nil {
		if errors.Is(err, errOtherCluster) {
			WriteError(w, http.StatusForbidden, "application deploys to a cluster this backend does not serve")
			return false
		}
		slog.Warn("security.rejected", "reason", "failed to resolve allowed namespaces", "error", err, "app", appName, "app_namespace", appNs)
		WriteError(w, http.StatusForbidden, "unable to authorize namespace")
		return false
	}
	if _, ok := allowed[requested]; !ok {
		WriteError(w, http.StatusForbidden, "namespace not managed by this application")
		return false
	}
	return true
}

// appFromHeader parses the namespace and name from the Argocd-Application-Name
// header which has the format "namespace:appname".
func appFromHeader(r *http.Request) (namespace, name string, ok bool) {
	parts := strings.SplitN(r.Header.Get("Argocd-Application-Name"), ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// allowedNamespaces returns the set of namespaces managed by the given ArgoCD
// Application: its destination namespace plus every namespace referenced by its
// status resources.
func (a *Authorizer) allowedNamespaces(ctx context.Context, appNs, appName string) (map[string]struct{}, error) {
	app, err := a.client.Resource(applicationGVR).Namespace(appNs).Get(ctx, appName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get application %s/%s: %w", appNs, appName, err)
	}
	if !a.servesCluster(app) {
		return nil, errOtherCluster
	}
	allowed := make(map[string]struct{})
	if dest, found, _ := unstructured.NestedString(app.Object, "spec", "destination", "namespace"); found && dest != "" {
		allowed[dest] = struct{}{}
	}
	resources, _, _ := unstructured.NestedSlice(app.Object, "status", "resources")
	for _, res := range resources {
		m, ok := res.(map[string]interface{})
		if !ok {
			continue
		}
		// Child Application CRs (app-of-apps) live in the ArgoCD namespace;
		// listing them must not grant read access to that namespace.
		if g, _ := m["group"].(string); g == "argoproj.io" {
			continue
		}
		if ns, ok := m["namespace"].(string); ok && ns != "" {
			allowed[ns] = struct{}{}
		}
	}
	return allowed, nil
}

// errOtherCluster means the Application deploys to a cluster this backend
// does not read from: the same namespace name here may belong to someone else.
var errOtherCluster = errors.New("application targets a different cluster")

// servesCluster reports whether app deploys to the cluster this backend reads
// from. Without WithCluster every app passes.
func (a *Authorizer) servesCluster(app *unstructured.Unstructured) bool {
	if a.clusterName == "" && a.clusterServer == "" {
		return true
	}
	name, _, _ := unstructured.NestedString(app.Object, "spec", "destination", "name")
	server, _, _ := unstructured.NestedString(app.Object, "spec", "destination", "server")
	return (a.clusterName != "" && name == a.clusterName) ||
		(a.clusterServer != "" && strings.TrimSuffix(server, "/") == a.clusterServer)
}
