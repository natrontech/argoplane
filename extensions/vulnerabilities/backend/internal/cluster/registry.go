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
	"fmt"
	"net/http"
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

// For returns a client for the cluster at serverURL. An empty URL, or the hub's
// own API server, yields the local client.
func (r *Registry) For(ctx context.Context, serverURL string) (dynamic.Interface, error) {
	key := normalize(serverURL)
	if r.localHosts[key] {
		return r.local, nil
	}

	r.mu.RLock()
	cached, ok := r.cache[key]
	r.mu.RUnlock()
	if ok {
		return cached, nil
	}

	client, err := r.build(ctx, key)
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
func (r *Registry) build(ctx context.Context, key string) (dynamic.Interface, error) {
	secrets, err := r.local.Resource(secretGVR).Namespace(r.namespace).
		List(ctx, metav1.ListOptions{LabelSelector: secretTypeSelector})
	if err != nil {
		return nil, fmt.Errorf("listing cluster secrets: %w", err)
	}

	for _, s := range secrets.Items {
		// Read through the unstructured form, where Secret data is still the
		// base64 the API returns rather than the decoded bytes the typed
		// client would hand back.
		data, _, _ := unstructured.NestedStringMap(s.Object, "data")

		server, err := base64.StdEncoding.DecodeString(data["server"])
		if err != nil {
			return nil, fmt.Errorf("decoding server of cluster secret %s: %w", s.GetName(), err)
		}
		if normalize(string(server)) != key {
			continue
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
			Host:    key,
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

	return nil, fmt.Errorf("no registered cluster matches %q", key)
}

// isGCPExec reports whether the exec plugin is argocd-k8s-auth's gcp mode.
func isGCPExec(e *struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}) bool {
	if e == nil || !strings.Contains(e.Command, "argocd-k8s-auth") {
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
