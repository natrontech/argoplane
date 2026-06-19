package handler

import (
	"context"
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
}

// NewAuthorizer creates a new Authorizer backed by the given dynamic client.
func NewAuthorizer(client dynamic.Interface) *Authorizer {
	return &Authorizer{client: client}
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

// resourceLabelSelector builds a Kubernetes label selector that filters Trivy reports
// to only those belonging to the given workload resource names. Names that are not
// valid Kubernetes label values are dropped to prevent selector injection.
func resourceLabelSelector(resources []string) string {
	valid := make([]string, 0, len(resources))
	for _, name := range resources {
		if len(name) > 63 || !validLabelValue.MatchString(name) {
			slog.Warn("dropping invalid resource name from label selector", "resource", name)
			continue
		}
		valid = append(valid, name)
	}
	if len(valid) == 0 {
		return ""
	}
	return fmt.Sprintf("trivy-operator.resource.name in (%s)", strings.Join(valid, ","))
}
