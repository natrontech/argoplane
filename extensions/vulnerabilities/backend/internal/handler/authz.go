package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// applicationGVR is the GroupVersionResource for ArgoCD Applications.
var applicationGVR = schema.GroupVersionResource{Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"}

// validNamespace checks that a namespace value is a valid Kubernetes name
// to prevent injection of arbitrary strings into K8s API calls.
var validNamespace = regexp.MustCompile(`^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$`)

// validLabelValue matches a valid Kubernetes label value (max 63 chars enforced separately).
var validLabelValue = regexp.MustCompile(`^[a-z0-9A-Z]([a-z0-9A-Z._-]*[a-z0-9A-Z])?$`)

// Authorizer authorizes namespace access based on the namespaces an ArgoCD
// Application manages (its destination namespace plus any namespaced resources).
type Authorizer struct {
	client dynamic.Interface
	cache  appCache
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

// NewAuthorizer creates a new Authorizer backed by the given dynamic client.
func NewAuthorizer(client dynamic.Interface, opts ...AuthorizerOption) *Authorizer {
	a := &Authorizer{client: client}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

// AuthorizeNamespace verifies that the requested namespace is managed by the
// ArgoCD Application identified in the proxy headers. It writes a 403 response
// and returns false when the request is not authorized.
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
		slog.Warn("security.rejected", "reason", "failed to resolve application namespaces", "error", err, "app", appNs+":"+appName)
		WriteError(w, http.StatusForbidden, "unable to authorize namespace")
		return false
	}
	if _, ok := allowed[requested]; !ok {
		slog.Warn("security.rejected", "reason", "namespace not managed by application", "namespace", requested, "app", appNs+":"+appName)
		WriteError(w, http.StatusForbidden, "namespace not managed by this application")
		return false
	}
	return true
}

// application returns the Application, from cache when it is still fresh.
func (a *Authorizer) application(ctx context.Context, appNs, appName string) (*unstructured.Unstructured, error) {
	key := appNs + "/" + appName
	if app, ok := a.cache.get(key, time.Now()); ok {
		return app, nil
	}
	app, err := a.client.Resource(applicationGVR).Namespace(appNs).Get(ctx, appName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get application %s/%s: %w", appNs, appName, err)
	}
	a.cache.put(key, app, time.Now())
	return app, nil
}

// Destination reports the cluster the Application deploys to, read from the
// Application itself rather than from a request header.
//
// ArgoCD only overwrites Argocd-Target-Cluster-URL when the Application sets
// spec.destination.server. An Application that names its destination instead
// leaves that header untouched, so a client could supply any value and read
// another cluster's reports. The Application is the only trustworthy source.
func (a *Authorizer) Destination(ctx context.Context, r *http.Request) (name, server string, err error) {
	appNs, appName, ok := appFromHeader(r)
	if !ok {
		return "", "", errors.New("request must come through ArgoCD proxy")
	}
	app, err := a.application(ctx, appNs, appName)
	if err != nil {
		return "", "", err
	}
	name, _, _ = unstructured.NestedString(app.Object, "spec", "destination", "name")
	server, _, _ = unstructured.NestedString(app.Object, "spec", "destination", "server")
	if name == "" && server == "" {
		return "", "", fmt.Errorf("application %s/%s has no destination cluster", appNs, appName)
	}
	return name, server, nil
}

// appFromHeader parses the "namespace:name" Argocd-Application-Name header.
func appFromHeader(r *http.Request) (namespace, name string, ok bool) {
	parts := strings.SplitN(r.Header.Get("Argocd-Application-Name"), ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// allowedNamespaces returns the set of namespaces the Application manages:
// its destination namespace plus the namespace of every resource in its status.
func (a *Authorizer) allowedNamespaces(ctx context.Context, appNs, appName string) (map[string]struct{}, error) {
	app, err := a.application(ctx, appNs, appName)
	if err != nil {
		return nil, err
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

// sanitizeFilename removes characters unsafe for Content-Disposition filenames.
func sanitizeFilename(s string) string {
	// Only allow alphanumeric, dash, underscore, dot.
	safe := regexp.MustCompile(`[^a-zA-Z0-9\-_.]`)
	return safe.ReplaceAllString(s, "_")
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

// matchNoReports is a label selector no object can satisfy: the label must both
// exist and not exist. An empty selector would match everything instead.
const matchNoReports = "trivy-operator.resource.name,!trivy-operator.resource.name"

// resourceLabelSelector builds a Kubernetes label selector that filters Trivy reports
// to only those belonging to the given workload resource names. Names that are not
// valid Kubernetes label values are dropped to prevent selector injection. A nil
// list means no filter; a list with no valid name, or none at all, matches no report.
func resourceLabelSelector(resources []string) string {
	if resources == nil {
		return ""
	}
	valid := make([]string, 0, len(resources))
	for _, name := range resources {
		if len(name) > 63 || !validLabelValue.MatchString(name) {
			slog.Warn("dropping invalid resource name from label selector", "resource", name)
			continue
		}
		valid = append(valid, name)
	}
	if len(valid) == 0 {
		return matchNoReports
	}
	return fmt.Sprintf("trivy-operator.resource.name in (%s)", strings.Join(valid, ","))
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

// appCacheTTL bounds how stale an Application's namespace set may be. One UI
// refresh sends several requests (a tab per resource, a graph per panel),
// and without the cache each of them is a live API-server GET.
const appCacheTTL = 10 * time.Second

type cachedApp struct {
	app     *unstructured.Unstructured
	expires time.Time
}

// appCache keeps fetched Applications for appCacheTTL. Failed lookups are not
// cached, so a missing or forbidden app is retried on the next request.
type appCache struct {
	mu    sync.Mutex
	items map[string]cachedApp
}

func (c *appCache) get(key string, now time.Time) (*unstructured.Unstructured, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.items[key]
	if !ok || now.After(e.expires) {
		return nil, false
	}
	return e.app, true
}

func (c *appCache) put(key string, app *unstructured.Unstructured, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.items == nil {
		c.items = make(map[string]cachedApp)
	}
	// Drop expired entries on write, so the map only holds apps viewed in
	// the last appCacheTTL.
	for k, e := range c.items {
		if now.After(e.expires) {
			delete(c.items, k)
		}
	}
	c.items[key] = cachedApp{app: app, expires: now.Add(appCacheTTL)}
}
