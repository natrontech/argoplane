package handler

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"

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
type Authorizer struct{ client dynamic.Interface }

func NewAuthorizer(client dynamic.Interface) *Authorizer { return &Authorizer{client: client} }

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
	app, err := a.client.Resource(applicationGVR).Namespace(appNs).Get(ctx, appName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get application %s/%s: %w", appNs, appName, err)
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
		if ns, ok := m["namespace"].(string); ok && ns != "" {
			allowed[ns] = struct{}{}
		}
	}
	return allowed, nil
}
