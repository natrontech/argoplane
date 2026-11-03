package handler

import (
	"context"
	"errors"
	"fmt"
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

var applicationGVR = schema.GroupVersionResource{Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"}

// validNamespace checks that a namespace value is a valid Kubernetes name
// to prevent injection of arbitrary strings into K8s API calls.
var validNamespace = regexp.MustCompile(`^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$`)

// Authorizer enforces that a request only touches namespaces managed by the
// ArgoCD Application named in the Argocd-Application-Name header.
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

// NewAuthorizer creates a new Authorizer backed by a dynamic client.
func NewAuthorizer(client dynamic.Interface, opts ...AuthorizerOption) *Authorizer {
	a := &Authorizer{client: client}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

// AuthorizeNamespace verifies the requested namespace is one the named Application
// manages (its destination namespace plus any namespace in status.resources).
func (a *Authorizer) AuthorizeNamespace(w http.ResponseWriter, r *http.Request, requested string) bool {
	if len(requested) > 63 || !validNamespace.MatchString(requested) {
		WriteError(w, http.StatusBadRequest, "invalid namespace")
		return false
	}
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
		WriteError(w, http.StatusForbidden, "unable to authorize namespace")
		return false
	}
	if _, ok := allowed[requested]; !ok {
		WriteError(w, http.StatusForbidden, "namespace not managed by this application")
		return false
	}
	return true
}

func appFromHeader(r *http.Request) (namespace, name string, ok bool) {
	parts := strings.SplitN(r.Header.Get("Argocd-Application-Name"), ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func (a *Authorizer) allowedNamespaces(ctx context.Context, appNs, appName string) (map[string]struct{}, error) {
	key := appNs + "/" + appName
	app, ok := a.cache.get(key, time.Now())
	if !ok {
		var err error
		app, err = a.client.Resource(applicationGVR).Namespace(appNs).Get(ctx, appName, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to get application %s/%s: %w", appNs, appName, err)
		}
		a.cache.put(key, app, time.Now())
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
