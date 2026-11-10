package handler

import (
	"context"
	"encoding/json"
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

	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alerts"
)

var (
	applicationGVR    = schema.GroupVersionResource{Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"}
	prometheusRuleGVR = schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "prometheusrules"}
)

// validName checks namespace and resource names before they are used, so
// arbitrary strings never reach the API server or a regular expression.
var validName = regexp.MustCompile(`^[a-z0-9]([a-z0-9.\-]{0,251}[a-z0-9])?$`)

// validLabel checks CLUSTER_LABEL is a Prometheus label name.
var validLabel = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// appCacheTTL bounds how stale an Application's scope may be. One UI refresh
// sends a request per tab and panel, and each would otherwise re-read the
// Application and every PrometheusRule it owns.
const appCacheTTL = 10 * time.Second

// appInfo is what a request's scope is built from.
type appInfo struct {
	namespaces map[string]struct{}
	ruleFiles  map[string]struct{}
	cluster    string
}

// Authorizer resolves which alerts a request may see, from the ArgoCD
// Application named in the Argocd-Application-Name header.
type Authorizer struct {
	client       dynamic.Interface
	clusterLabel string
	clusterMap   map[string]string

	mu    sync.Mutex
	cache map[string]cachedApp
}

type cachedApp struct {
	info    appInfo
	expires time.Time
}

// NewAuthorizer returns an Authorizer. An empty clusterLabel disables the
// cluster filter.
func NewAuthorizer(client dynamic.Interface, clusterLabel string, clusterMap map[string]string) *Authorizer {
	return &Authorizer{client: client, clusterLabel: clusterLabel, clusterMap: clusterMap, cache: map[string]cachedApp{}}
}

// forbiddenError is a request the caller is not allowed to make. Its message
// is safe to return to the client.
type forbiddenError struct{ msg string }

func (e forbiddenError) Error() string { return e.msg }

// Scope builds the scope for a request. namespace narrows it to one of the
// Application's namespaces; resource narrows it further to one workload.
func (a *Authorizer) Scope(ctx context.Context, r *http.Request, namespace string, resource *alerts.Resource) (alerts.Scope, error) {
	appNs, appName, ok := appFromHeader(r)
	if !ok {
		return alerts.Scope{}, forbiddenError{"request must come through ArgoCD proxy"}
	}
	info, err := a.app(ctx, appNs, appName)
	if err != nil {
		return alerts.Scope{}, err
	}

	s := alerts.Scope{
		Namespaces:   info.namespaces,
		AppRuleFiles: info.ruleFiles,
		Cluster:      info.cluster,
		AppWide:      namespace == "",
		Resource:     resource,
	}
	if namespace != "" {
		if _, ok := info.namespaces[namespace]; !ok {
			return alerts.Scope{}, forbiddenError{"namespace not managed by this application"}
		}
		s.Namespaces = map[string]struct{}{namespace: {}}
	}
	return s, nil
}

// app returns the Application's scope inputs, from cache while fresh.
func (a *Authorizer) app(ctx context.Context, appNs, appName string) (appInfo, error) {
	key := appNs + "/" + appName
	now := time.Now()

	a.mu.Lock()
	if c, ok := a.cache[key]; ok && now.Before(c.expires) {
		a.mu.Unlock()
		return c.info, nil
	}
	a.mu.Unlock()

	app, err := a.client.Resource(applicationGVR).Namespace(appNs).Get(ctx, appName, metav1.GetOptions{})
	if err != nil {
		return appInfo{}, fmt.Errorf("failed to get application %s/%s: %w", appNs, appName, err)
	}
	info := appInfo{
		namespaces: map[string]struct{}{},
		ruleFiles:  map[string]struct{}{},
		cluster:    a.resolveCluster(app.Object),
	}
	if dest, _, _ := unstructured.NestedString(app.Object, "spec", "destination", "namespace"); dest != "" {
		info.namespaces[dest] = struct{}{}
	}
	resources, _, _ := unstructured.NestedSlice(app.Object, "status", "resources")
	for _, res := range resources {
		m, ok := res.(map[string]any)
		if !ok {
			continue
		}
		group, _ := m["group"].(string)
		kind, _ := m["kind"].(string)
		ns, _ := m["namespace"].(string)
		name, _ := m["name"].(string)
		// Child Application CRs (app-of-apps) live in the ArgoCD namespace;
		// listing them must not grant read access to that namespace.
		if group == "argoproj.io" || ns == "" {
			continue
		}
		info.namespaces[ns] = struct{}{}
		if group == prometheusRuleGVR.Group && kind == "PrometheusRule" {
			if file, err := a.ruleFile(ctx, ns, name); err != nil {
				// Treated as a platform rule: its alerts stay visible only
				// through their namespace label.
				slog.Warn("failed to resolve PrometheusRule", "namespace", ns, "name", name, "error", err)
			} else {
				info.ruleFiles[file] = struct{}{}
			}
		}
	}

	a.mu.Lock()
	a.cache[key] = cachedApp{info: info, expires: now.Add(appCacheTTL)}
	for k, c := range a.cache {
		if now.After(c.expires) {
			delete(a.cache, k)
		}
	}
	a.mu.Unlock()
	return info, nil
}

// ruleFile returns the rule file prometheus-operator generates for a
// PrometheusRule: "<namespace>-<name>-<uid>.yaml". The UID makes it exact; a
// prefix match on namespace and name alone could claim another namespace's
// rules ("team-x" + "y" and "team" + "x-y" share a prefix).
func (a *Authorizer) ruleFile(ctx context.Context, ns, name string) (string, error) {
	rule, err := a.client.Resource(prometheusRuleGVR).Namespace(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get prometheusrule %s/%s: %w", ns, name, err)
	}
	return fmt.Sprintf("%s-%s-%s.yaml", ns, name, rule.GetUID()), nil
}

// ParseClusterConfig validates CLUSTER_LABEL and decodes CLUSTER_MAP, a JSON
// object mapping ArgoCD cluster names or server URLs to label values. Same
// semantics as the metrics and logs backends.
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
		m[strings.TrimSuffix(k, "/")] = v
	}
	return m, nil
}

// resolveCluster returns the cluster label value for an Application, or "" for
// no filter: map by destination name, then by server, then the name itself.
func (a *Authorizer) resolveCluster(app map[string]any) string {
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

func appFromHeader(r *http.Request) (namespace, name string, ok bool) {
	parts := strings.SplitN(r.Header.Get("Argocd-Application-Name"), ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}
