// Package cluster resolves a Kubernetes client for whichever cluster an ArgoCD
// Application actually deploys to.
//
// Upstream the backend builds one in-cluster client and uses it for everything,
// which only works where ArgoCD manages its own cluster. In a hub-spoke install
// the Application CRs live on the hub while the VulnerabilityReports live on the
// spoke, so no single in-cluster client can see both.
//
// ArgoCD already solves the hard half: it sends the target cluster on every
// proxy-extension request (Argocd-Target-Cluster-URL) and it already holds
// credentials for every registered cluster in the hub's argocd namespace. This
// package joins the two — look up the Secret whose server matches the header,
// build a client from it, and cache it.
package cluster

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// secretGVR lets the existing dynamic client read cluster Secrets, so this
// package does not pull in the typed clientset just to list one resource.
var secretGVR = schema.GroupVersionResource{Version: "v1", Resource: "secrets"}

// secretTypeSelector matches the Secrets ArgoCD writes for registered clusters.
const secretTypeSelector = "argocd.argoproj.io/secret-type=cluster"

// inClusterName is the destination name ArgoCD reserves for the cluster it
// runs on. It has no cluster Secret — ArgoCD resolves the name internally — so
// it has to be recognised here or every single-cluster install would fail the
// Secret lookup.
const inClusterName = "in-cluster"

// gcpScopes mirrors argocd-k8s-auth's own gcp command, so a cluster Secret using
// that exec plugin keeps working without shipping the binary in this image.
var gcpScopes = []string{
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
}

// apiTimeout bounds every call made through a resolved client, matching the
// bound the upstream backend puts on its in-cluster client.
const apiTimeout = 25 * time.Second

// clusterConfig is the subset of ArgoCD's cluster Secret "config" blob this
// package understands.
type clusterConfig struct {
	BearerToken     string `json:"bearerToken"`
	TLSClientConfig struct {
		Insecure bool   `json:"insecure"`
		CAData   []byte `json:"caData"`
	} `json:"tlsClientConfig"`
	ExecProviderConfig *struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
	} `json:"execProviderConfig"`
}

// Registry hands out a dynamic client per target cluster.
type Registry struct {
	local      dynamic.Interface
	localHosts map[string]bool
	namespace  string

	mu    sync.RWMutex
	cache map[string]dynamic.Interface
}

// NewRegistry returns a Registry that serves local for the hub's own API server
// and builds clients from cluster Secrets in namespace for everything else.
// The cluster Secrets live beside ArgoCD, so local reads those too.
func NewRegistry(local dynamic.Interface, namespace, inClusterHost string) *Registry {
	hosts := map[string]bool{
		"":                               true,
		"https://kubernetes.default.svc": true,
		"https://kubernetes.default.svc.cluster.local": true,
	}
	if h := normalize(inClusterHost); h != "" {
		hosts[h] = true
	}
	return &Registry{
		local:      local,
		localHosts: hosts,
		namespace:  namespace,
		cache:      map[string]dynamic.Interface{},
	}
}

// Local returns the hub's own client — the one that can read Application CRs.
func (r *Registry) Local() dynamic.Interface { return r.local }

// Destination identifies the cluster an Application deploys to. ArgoCD
// Applications set either a name or a server, and the project scopes which
// registered clusters are usable.
type Destination struct {
	Name    string
	Server  string
	Project string
}

// For returns a client for the cluster the Application deploys to.
//
// The hub's own API server yields the local client. Anything else must match
// exactly one registered cluster Secret: there is deliberately no fallback to
// the local client, which would quietly answer with the wrong cluster's
// reports.
func (r *Registry) For(ctx context.Context, d Destination) (dynamic.Interface, error) {
	d.Server = normalize(d.Server)
	if d.Name == "" && d.Server == "" {
		return nil, errors.New("application has no destination cluster")
	}
	if d.Server != "" && r.localHosts[d.Server] {
		return r.local, nil
	}
	if d.Server == "" && d.Name == inClusterName {
		return r.local, nil
	}

	// Keyed on the whole destination, so a cache hit can only ever come from a
	// request that would resolve the same way. Keying on the server alone let
	// a request naming a different cluster reuse this entry.
	key := d.Project + "|" + d.Name + "|" + d.Server

	r.mu.RLock()
	cached, ok := r.cache[key]
	r.mu.RUnlock()
	if ok {
		return cached, nil
	}

	client, err := r.build(ctx, d)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	// Another request may have built the same client while this one waited.
	if existing, ok := r.cache[key]; ok {
		client = existing
	} else {
		r.cache[key] = client
	}
	r.mu.Unlock()

	return client, nil
}

// build finds the cluster Secret whose server matches key and turns it into a
// dynamic client.
func (r *Registry) build(ctx context.Context, d Destination) (dynamic.Interface, error) {
	secrets, err := r.local.Resource(secretGVR).Namespace(r.namespace).
		List(ctx, metav1.ListOptions{LabelSelector: secretTypeSelector})
	if err != nil {
		return nil, fmt.Errorf("listing cluster secrets: %w", err)
	}

	var matches []unstructured.Unstructured

	for _, s := range secrets.Items {
		// Read through the unstructured form, where Secret data is still the
		// base64 the API returns rather than the decoded bytes the typed
		// client would hand back.
		data, _, _ := unstructured.NestedStringMap(s.Object, "data")

		server, err := base64.StdEncoding.DecodeString(data["server"])
		if err != nil {
			return nil, fmt.Errorf("decoding server of cluster secret %s: %w", s.GetName(), err)
		}
		name, err := base64.StdEncoding.DecodeString(data["name"])
		if err != nil {
			return nil, fmt.Errorf("decoding name of cluster secret %s: %w", s.GetName(), err)
		}

		project, err := base64.StdEncoding.DecodeString(data["project"])
		if err != nil {
			return nil, fmt.Errorf("decoding project of cluster secret %s: %w", s.GetName(), err)
		}

		// A project-scoped cluster belongs to that project alone. Ignoring
		// this would let an Application in one project read reports from
		// another project's cluster, which ArgoCD itself would never deploy
		// to. An empty project means the cluster is global.
		if p := string(project); p != "" && p != d.Project {
			continue
		}

		// Match on every field the Application actually supplied. Applications
		// set one or the other, but if both are present they must agree:
		// accepting either alone would let them disagree and resolve to a
		// cluster the Application never named.
		if d.Server != "" && normalize(string(server)) != d.Server {
			continue
		}
		if d.Name != "" && string(name) != d.Name {
			continue
		}

		matches = append(matches, s)
	}

	// ArgoCD does not require cluster names to be unique and errors when one
	// resolves to several clusters ("there are N clusters with the same
	// name"). Picking the first would silently read whichever Secret the API
	// happened to return first.
	if len(matches) > 1 {
		names := make([]string, 0, len(matches))
		for _, m := range matches {
			names = append(names, m.GetName())
		}
		return nil, fmt.Errorf("destination name=%q server=%q matches %d cluster secrets: %s",
			d.Name, d.Server, len(matches), strings.Join(names, ", "))
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("no registered cluster matches name=%q server=%q", d.Name, d.Server)
	}

	{
		s := matches[0]
		data, _, _ := unstructured.NestedStringMap(s.Object, "data")
		server, _ := base64.StdEncoding.DecodeString(data["server"])

		// An Application that names its destination gives no URL; the Secret
		// is where the real endpoint comes from.
		host := normalize(string(server))
		if host == "" {
			return nil, fmt.Errorf("cluster secret %s has no server URL", s.GetName())
		}
		if r.localHosts[host] {
			return r.local, nil
		}

		var cc clusterConfig
		if encoded := data["config"]; encoded != "" {
			raw, err := base64.StdEncoding.DecodeString(encoded)
			if err != nil {
				return nil, fmt.Errorf("decoding config of cluster secret %s: %w", s.GetName(), err)
			}
			if err := json.Unmarshal(raw, &cc); err != nil {
				return nil, fmt.Errorf("parsing config of cluster secret %s: %w", s.GetName(), err)
			}
		}

		cfg := &rest.Config{
			Host:    host,
			Timeout: apiTimeout,
			TLSClientConfig: rest.TLSClientConfig{
				Insecure: cc.TLSClientConfig.Insecure,
				CAData:   cc.TLSClientConfig.CAData,
			},
		}

		switch {
		case cc.BearerToken != "":
			cfg.BearerToken = cc.BearerToken

		case isGCPExec(cc.ExecProviderConfig):
			// Same credential argocd-k8s-auth gcp would mint, obtained in
			// process. Wrapping the transport (rather than setting a static
			// BearerToken) lets the token refresh on its own — these are
			// ~1h GKE Workload Identity tokens, and a cached client outlives
			// them.
			ts, err := google.DefaultTokenSource(ctx, gcpScopes...)
			if err != nil {
				return nil, fmt.Errorf("google credentials for cluster %s: %w", s.GetName(), err)
			}
			cfg.Wrap(func(base http.RoundTripper) http.RoundTripper {
				return &oauth2.Transport{Source: ts, Base: base}
			})

		default:
			return nil, fmt.Errorf("cluster secret %s uses an auth method this backend does not support", s.GetName())
		}

		client, err := dynamic.NewForConfig(cfg)
		if err != nil {
			return nil, fmt.Errorf("building client for cluster %s: %w", s.GetName(), err)
		}
		return client, nil
	}

}

// isGCPExec reports whether the exec plugin is argocd-k8s-auth's gcp mode.
func isGCPExec(e *struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}) bool {
	if e == nil || path.Base(e.Command) != "argocd-k8s-auth" {
		return false
	}
	for _, a := range e.Args {
		if a == "gcp" {
			return true
		}
	}
	return false
}

// normalize makes server URLs comparable across the header and the Secret.
func normalize(s string) string {
	return strings.TrimSuffix(strings.TrimSpace(s), "/")
}
