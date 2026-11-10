// Package cluster resolves a Kubernetes client for whichever cluster an ArgoCD
// Application deploys to.
//
// Upstream the backend builds one in-cluster client and uses it for everything,
// which only works where ArgoCD manages its own cluster. In a hub-spoke install
// the Application CRs live on the hub while the VulnerabilityReports live on the
// spoke, so no single in-cluster client can see both.
//
// The hub already holds credentials for every registered cluster, in the cluster
// Secrets ArgoCD maintains in its own namespace. This package looks up the Secret
// matching an Application's destination, builds a client from it, and caches it.
//
// Destinations resolve the way ArgoCD resolves them (GetDestinationServer in
// util/argo/argo.go): by server URL when the Application gives one, otherwise by
// name across every registered cluster, with more than one match treated as an
// error. Project scoping is deliberately not applied — ArgoCD lets an
// Application deploy to a cluster scoped to another project unless its
// AppProject sets permitOnlyProjectScopedClusters, and it has already validated
// the destination before the request reaches an extension.
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

// inClusterName is the destination name ArgoCD reserves for the cluster it runs
// on. It has no cluster Secret — ArgoCD resolves the name internally — so it has
// to be recognised here or a single-cluster install would fail the lookup.
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

// DefaultCacheTTL bounds how long a resolved client is reused. Without an expiry
// a rotated bearer token keeps returning 401 until the pod restarts, and a
// cluster that has been unregistered stays readable.
const DefaultCacheTTL = 5 * time.Minute

// Destination identifies the cluster an Application deploys to. ArgoCD rejects
// an Application that sets both fields, so exactly one is populated in practice.
type Destination struct {
	Name   string
	Server string
}

// clusterConfig is the subset of ArgoCD's cluster Secret "config" blob this
// package understands. Fields it cannot honour are parsed too, so they can be
// rejected rather than silently ignored.
type clusterConfig struct {
	BearerToken     string `json:"bearerToken"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	ProxyURL        string `json:"proxyUrl"`
	TLSClientConfig struct {
		Insecure   bool   `json:"insecure"`
		ServerName string `json:"serverName"`
		CAData     []byte `json:"caData"`
		CertData   []byte `json:"certData"`
		KeyData    []byte `json:"keyData"`
	} `json:"tlsClientConfig"`
	AWSAuthConfig      *json.RawMessage `json:"awsAuthConfig"`
	ExecProviderConfig *execConfig      `json:"execProviderConfig"`
}

type execConfig struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

type cacheEntry struct {
	client  dynamic.Interface
	expires time.Time
}

// Registry hands out a dynamic client per target cluster.
type Registry struct {
	local      dynamic.Interface
	localHosts map[string]bool
	namespace  string
	ttl        time.Duration
	now        func() time.Time

	mu    sync.Mutex
	cache map[string]cacheEntry
}

// NewRegistry returns a Registry that serves local for the hub's own API server
// and builds clients from cluster Secrets in namespace for everything else.
// The cluster Secrets live beside ArgoCD, so local reads those too.
func NewRegistry(local dynamic.Interface, namespace, inClusterHost string) *Registry {
	hosts := map[string]bool{
		"https://kubernetes.default.svc":               true,
		"https://kubernetes.default.svc.cluster.local": true,
	}
	if h := normalize(inClusterHost); h != "" {
		hosts[h] = true
	}
	return &Registry{
		local:      local,
		localHosts: hosts,
		namespace:  namespace,
		ttl:        DefaultCacheTTL,
		now:        time.Now,
		cache:      map[string]cacheEntry{},
	}
}

// Local returns the hub's own client — the one that can read Application CRs.
func (r *Registry) Local() dynamic.Interface { return r.local }

// For returns a client for the cluster the Application deploys to.
//
// The hub's own API server yields the local client. Anything else must match
// exactly one registered cluster Secret: there is deliberately no fallback to
// the local client, which would quietly answer with the wrong cluster's reports.
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

	key := d.Server
	if key == "" {
		key = "name/" + d.Name
	}

	if client, ok := r.cached(key); ok {
		return client, nil
	}

	client, err := r.build(ctx, d)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	// Another request may have built the same client while this one waited.
	if existing, ok := r.cache[key]; ok && r.now().Before(existing.expires) {
		client = existing.client
	} else {
		r.cache[key] = cacheEntry{client: client, expires: r.now().Add(r.ttl)}
	}
	r.mu.Unlock()

	return client, nil
}

// cached returns a client only while its entry is still inside the TTL.
func (r *Registry) cached(key string) (dynamic.Interface, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	entry, ok := r.cache[key]
	if !ok {
		return nil, false
	}
	if !r.now().Before(entry.expires) {
		delete(r.cache, key)
		return nil, false
	}
	return entry.client, true
}

// build finds the cluster Secret matching the destination and turns it into a
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

		server, err := decode(data["server"])
		if err != nil {
			return nil, fmt.Errorf("decoding server of cluster secret %s: %w", s.GetName(), err)
		}
		name, err := decode(data["name"])
		if err != nil {
			return nil, fmt.Errorf("decoding name of cluster secret %s: %w", s.GetName(), err)
		}

		// Exactly one field is set: ArgoCD rejects a destination with both.
		if d.Server != "" {
			if normalize(server) != d.Server {
				continue
			}
		} else if name != d.Name {
			continue
		}

		matches = append(matches, s)
	}

	// ArgoCD does not require cluster names to be unique and errors when one
	// resolves to several ("there are N clusters with the same name"). Picking
	// the first would silently read whichever Secret the API listed first.
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

	secret := matches[0]
	data, _, _ := unstructured.NestedStringMap(secret.Object, "data")

	host, err := decode(data["server"])
	if err != nil {
		return nil, fmt.Errorf("decoding server of cluster secret %s: %w", secret.GetName(), err)
	}
	host = normalize(host)
	if host == "" {
		return nil, fmt.Errorf("cluster secret %s has no server URL", secret.GetName())
	}
	// A cluster registered under its own name may still be this very cluster.
	if r.localHosts[host] {
		return r.local, nil
	}

	var cc clusterConfig
	if encoded := data["config"]; encoded != "" {
		raw, err := decode(encoded)
		if err != nil {
			return nil, fmt.Errorf("decoding config of cluster secret %s: %w", secret.GetName(), err)
		}
		if err := json.Unmarshal([]byte(raw), &cc); err != nil {
			return nil, fmt.Errorf("parsing config of cluster secret %s: %w", secret.GetName(), err)
		}
	}

	cfg, err := restConfig(secret.GetName(), host, cc)
	if err != nil {
		return nil, err
	}

	client, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("building client for cluster %s: %w", secret.GetName(), err)
	}
	return client, nil
}

// restConfig turns a cluster Secret's config into a rest.Config, refusing
// anything it cannot honour rather than connecting with less than was asked for.
func restConfig(secretName, host string, cc clusterConfig) (*rest.Config, error) {
	// Dropping either of these silently would mean talking to a different
	// endpoint, or skipping a hostname check, than the Secret asked for.
	if cc.ProxyURL != "" {
		return nil, fmt.Errorf("cluster secret %s sets proxyUrl, which this backend does not support", secretName)
	}
	if cc.TLSClientConfig.ServerName != "" {
		return nil, fmt.Errorf("cluster secret %s sets tlsClientConfig.serverName, which this backend does not support", secretName)
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
		// Same credential argocd-k8s-auth gcp would mint, obtained in process.
		//
		// context.Background(), not the request's context: a metadata-server
		// source ignores the context, but a key file or external_account
		// source keeps the one it was built with and reuses it for every
		// refresh. Tied to a single request, the first refresh after that
		// request finished would fail with "context canceled", and keep
		// failing until the pod restarted.
		ts, err := google.DefaultTokenSource(context.Background(), gcpScopes...)
		if err != nil {
			return nil, fmt.Errorf("google credentials for cluster %s: %w", secretName, err)
		}
		cfg.Wrap(func(base http.RoundTripper) http.RoundTripper {
			return &oauth2.Transport{Source: ts, Base: base}
		})

	default:
		return nil, fmt.Errorf("cluster secret %s uses an auth method this backend does not support "+
			"(supported: bearerToken, or execProviderConfig running argocd-k8s-auth gcp)", secretName)
	}

	return cfg, nil
}

// isGCPExec reports whether the exec plugin is argocd-k8s-auth's gcp mode.
func isGCPExec(e *execConfig) bool {
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

// decode unwraps the base64 the API returns for Secret data.
func decode(s string) (string, error) {
	if s == "" {
		return "", nil
	}
	b, err := base64.StdEncoding.DecodeString(s)
	return string(b), err
}

// normalize makes server URLs comparable across destinations and Secrets.
func normalize(s string) string {
	return strings.TrimSuffix(strings.TrimSpace(s), "/")
}
