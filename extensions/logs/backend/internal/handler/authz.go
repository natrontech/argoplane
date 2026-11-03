package handler

import (
	"context"
	"encoding/json"
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

// validLabel checks that CLUSTER_LABEL is a valid Loki label name, since it
// is inserted into LogQL selectors unquoted.
var validLabel = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// Authorizer enforces that a request only touches namespaces managed by the
// ArgoCD Application named in the Argocd-Application-Name header.
type Authorizer struct {
	client       dynamic.Interface
	clusterLabel string
	clusterMap   map[string]string
}

// NewAuthorizer returns an Authorizer. An empty clusterLabel disables the
// cluster filter.
func NewAuthorizer(client dynamic.Interface, clusterLabel string, clusterMap map[string]string) *Authorizer {
	return &Authorizer{client: client, clusterLabel: clusterLabel, clusterMap: clusterMap}
}

// ParseClusterConfig validates CLUSTER_LABEL and decodes CLUSTER_MAP, a JSON
// object mapping ArgoCD cluster names or server URLs to label values.
func ParseClusterConfig(label, mapJSON string) (map[string]string, error) {
	if label != "" && !validLabel.MatchString(label) {
		return nil, fmt.Errorf("invalid CLUSTER_LABEL %q", label)
	}
	raw := map[string]string{}
	if mapJSON != "" {
		if err := json.Unmarshal([]byte(mapJSON), &raw); err != nil {
			return nil, fmt.Errorf("invalid CLUSTER_MAP: %w", err)
		}
	}
	m := make(map[string]string, len(raw))
	for k, v := range raw {
		if strings.ContainsAny(v, "\r\n") {
			return nil, fmt.Errorf("CLUSTER_MAP value for %q contains a newline", k)
		}
		m[strings.TrimSuffix(k, "/")] = v
	}
	return m, nil
}

// resolveCluster returns the cluster label value for an Application, or ""
// for no filter. Lookup order: map by destination name, map by destination
// server, then the destination name itself. A map value of "" disables the
// filter for that cluster.
func (a *Authorizer) resolveCluster(app map[string]interface{}) string {
	if a.clusterLabel == "" {
		return ""
	}
	name, _, _ := unstructured.NestedString(app, "spec", "destination", "name")
	server, _, _ := unstructured.NestedString(app, "spec", "destination", "server")
	if v, ok := a.clusterMap[name]; ok && name != "" {
		return v
	}
	if v, ok := a.clusterMap[strings.TrimSuffix(server, "/")]; ok && server != "" {
		return v
	}
	return name
}

// AuthorizeNamespace verifies the requested namespace is one the named Application
// manages (its destination namespace plus any namespace in status.resources).
// On success it returns the Application's cluster label value, or "" for no
// cluster filter.
func (a *Authorizer) AuthorizeNamespace(w http.ResponseWriter, r *http.Request, requested string) (cluster string, ok bool) {
	if len(requested) > 63 || !validNamespace.MatchString(requested) {
		writeError(w, http.StatusBadRequest, "invalid namespace")
		return "", false
	}
	appNs, appName, ok := appFromHeader(r)
	if !ok {
		writeError(w, http.StatusForbidden, "request must come through ArgoCD proxy")
		return "", false
	}
	app, allowed, err := a.allowedNamespaces(r.Context(), appNs, appName)
	if err != nil {
		writeError(w, http.StatusForbidden, "unable to authorize namespace")
		return "", false
	}
	if _, ok := allowed[requested]; !ok {
		writeError(w, http.StatusForbidden, "namespace not managed by this application")
		return "", false
	}
	return a.resolveCluster(app), true
}

func appFromHeader(r *http.Request) (namespace, name string, ok bool) {
	parts := strings.SplitN(r.Header.Get("Argocd-Application-Name"), ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func (a *Authorizer) allowedNamespaces(ctx context.Context, appNs, appName string) (map[string]interface{}, map[string]struct{}, error) {
	app, err := a.client.Resource(applicationGVR).Namespace(appNs).Get(ctx, appName, metav1.GetOptions{})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get application %s/%s: %w", appNs, appName, err)
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
	return app.Object, allowed, nil
}
