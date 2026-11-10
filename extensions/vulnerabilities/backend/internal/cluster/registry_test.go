package cluster

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

// clusterSecret builds the unstructured form of an ArgoCD cluster Secret, with
// data base64-encoded exactly as the API server returns it.
func clusterSecret(name, server, config string) *unstructured.Unstructured {
	return namedClusterSecret(name, name, server, config)
}

// namedClusterSecret separates the Secret's own name from the cluster name it
// advertises: ArgoCD allows two differently-named Secrets to claim the same
// cluster name, which is the ambiguity this package has to reject.
func namedClusterSecret(secretName, name, server, config string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata": map[string]any{
			"name":      secretName,
			"namespace": "argocd",
			"labels":    map[string]any{"argocd.argoproj.io/secret-type": "cluster"},
		},
		"data": map[string]any{
			"name":   base64.StdEncoding.EncodeToString([]byte(name)),
			"server": base64.StdEncoding.EncodeToString([]byte(server)),
			"config": base64.StdEncoding.EncodeToString([]byte(config)),
		},
	}}
}

func newTestRegistry(secrets ...*unstructured.Unstructured) (*Registry, *dynamicfake.FakeDynamicClient) {
	scheme := runtime.NewScheme()
	listKinds := map[schema.GroupVersionResource]string{secretGVR: "SecretList"}

	objs := make([]runtime.Object, 0, len(secrets))
	for _, s := range secrets {
		objs = append(objs, s)
	}

	local := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, listKinds, objs...)
	return NewRegistry(local, "argocd", "https://10.0.0.1:443"), local
}

func TestForReturnsLocalClientForHub(t *testing.T) {
	reg, local := newTestRegistry()

	// Every spelling of "this cluster" must map to the local client, or the
	// backend goes looking for a Secret that never exists for the hub.
	for _, server := range []string{
		"https://kubernetes.default.svc",
		"https://kubernetes.default.svc/",
		"https://kubernetes.default.svc.cluster.local",
		"https://10.0.0.1:443",
	} {
		got, err := reg.For(context.Background(), Destination{Server: server})
		if err != nil {
			t.Fatalf("For(server=%q) returned error: %v", server, err)
		}
		if got != local {
			t.Errorf("For(server=%q) did not return the local client", server)
		}
	}
}

func TestForResolvesInClusterByName(t *testing.T) {
	// ArgoCD reserves "in-cluster" for the cluster it runs on and resolves it
	// internally, so no Secret exists for it.
	reg, local := newTestRegistry()

	got, err := reg.For(context.Background(), Destination{Name: "in-cluster"})
	if err != nil {
		t.Fatalf("in-cluster should resolve without a Secret: %v", err)
	}
	if got != local {
		t.Error("in-cluster must resolve to the local client")
	}
}

func TestForResolvesLocalClusterRegisteredUnderAName(t *testing.T) {
	// Plenty of installs register the local cluster through a Secret under a
	// custom name. Resolving that to anything but the local client would build
	// a second client for the cluster the backend already runs on.
	reg, local := newTestRegistry(clusterSecret("hub", "https://kubernetes.default.svc", `{}`))

	got, err := reg.For(context.Background(), Destination{Name: "hub"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != local {
		t.Error("a Secret pointing at this cluster must resolve to the local client")
	}
}

func TestForBuildsClientFromBearerTokenSecret(t *testing.T) {
	reg, local := newTestRegistry(clusterSecret("spoke", "https://34.93.70.199",
		`{"bearerToken":"tok","tlsClientConfig":{"insecure":true}}`))

	got, err := reg.For(context.Background(), Destination{Server: "https://34.93.70.199"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || got == local {
		t.Fatal("expected a distinct client for the spoke cluster")
	}
}

func TestForResolvesByDestinationName(t *testing.T) {
	// ArgoCD Applications may name their destination instead of giving a URL,
	// in which case the Secret is the only place the endpoint comes from.
	reg, local := newTestRegistry(clusterSecret("services-1-staging", "https://34.93.70.199",
		`{"bearerToken":"tok","tlsClientConfig":{"insecure":true}}`))

	got, err := reg.For(context.Background(), Destination{Name: "services-1-staging"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || got == local {
		t.Fatal("expected a distinct client resolved from the destination name")
	}
}

func TestForCachesPerCluster(t *testing.T) {
	reg, _ := newTestRegistry(clusterSecret("spoke", "https://34.93.70.199",
		`{"bearerToken":"tok","tlsClientConfig":{"insecure":true}}`))

	first, err := reg.For(context.Background(), Destination{Server: "https://34.93.70.199"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// A trailing slash is the same cluster: it must hit the same cache entry
	// rather than build a fresh client on every request.
	second, err := reg.For(context.Background(), Destination{Server: "https://34.93.70.199/"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if first != second {
		t.Error("expected the cached client to be reused")
	}
}

func TestForCacheExpires(t *testing.T) {
	// Without an expiry a rotated token keeps failing until the pod restarts,
	// and a cluster that has been unregistered stays readable.
	reg, _ := newTestRegistry(clusterSecret("spoke", "https://34.93.70.199",
		`{"bearerToken":"tok","tlsClientConfig":{"insecure":true}}`))

	now := time.Now()
	reg.now = func() time.Time { return now }

	first, err := reg.For(context.Background(), Destination{Server: "https://34.93.70.199"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	now = now.Add(DefaultCacheTTL + time.Second)

	second, err := reg.For(context.Background(), Destination{Server: "https://34.93.70.199"})
	if err != nil {
		t.Fatalf("unexpected error after expiry: %v", err)
	}
	if first == second {
		t.Error("expected a rebuilt client once the cache entry expired")
	}
}

func TestForWithoutDestinationFails(t *testing.T) {
	// No destination at all must be an error, never a quiet fall back to the
	// hub's own client answering with the wrong cluster's reports.
	reg, _ := newTestRegistry()

	if _, err := reg.For(context.Background(), Destination{}); err == nil {
		t.Fatal("expected an error when the application has no destination")
	}
}

func TestForUnknownClusterFails(t *testing.T) {
	reg, _ := newTestRegistry()

	if _, err := reg.For(context.Background(), Destination{Server: "https://not-registered"}); err == nil {
		t.Fatal("expected an error for a cluster with no Secret")
	}
}

func TestForUnknownNameFails(t *testing.T) {
	reg, _ := newTestRegistry(clusterSecret("spoke", "https://34.93.70.199", `{"bearerToken":"tok"}`))

	if _, err := reg.For(context.Background(), Destination{Name: "not-registered"}); err == nil {
		t.Fatal("expected an error for a destination name with no Secret")
	}
}

func TestForRejectsAmbiguousName(t *testing.T) {
	// ArgoCD does not require cluster names to be unique and errors when one
	// resolves to several. Returning the first match would silently read
	// whichever Secret the API happened to list first.
	reg, _ := newTestRegistry(
		namedClusterSecret("secret-a", "dup", "https://a.example", `{"bearerToken":"tok"}`),
		namedClusterSecret("secret-b", "dup", "https://b.example", `{"bearerToken":"tok"}`),
	)

	if _, err := reg.For(context.Background(), Destination{Name: "dup"}); err == nil {
		t.Fatal("expected an error when a name matches several cluster secrets")
	}
}

func TestForRejectsUnsupportedAuth(t *testing.T) {
	// An auth method this backend cannot use must fail loudly. Falling back to
	// an anonymous client would surface as an empty report list instead.
	for name, config := range map[string]string{
		"azure exec":         `{"execProviderConfig":{"command":"argocd-k8s-auth","args":["azure"]}}`,
		"aws":                `{"awsAuthConfig":{"clusterName":"eks"}}`,
		"client certificate": `{"tlsClientConfig":{"certData":"Zm9v","keyData":"YmFy"}}`,
		"basic auth":         `{"username":"u","password":"p"}`,
	} {
		t.Run(name, func(t *testing.T) {
			reg, _ := newTestRegistry(clusterSecret("other", "https://other.example", config))
			if _, err := reg.For(context.Background(), Destination{Name: "other"}); err == nil {
				t.Fatalf("expected an error for %s", name)
			}
		})
	}
}

func TestForRejectsSilentlyIgnoredFields(t *testing.T) {
	// Honouring neither would mean connecting somewhere other than the Secret
	// asked for, or skipping a hostname check, without saying so.
	for name, config := range map[string]string{
		"proxyUrl":   `{"bearerToken":"tok","proxyUrl":"http://proxy.example:3128"}`,
		"serverName": `{"bearerToken":"tok","tlsClientConfig":{"serverName":"other.example"}}`,
	} {
		t.Run(name, func(t *testing.T) {
			reg, _ := newTestRegistry(clusterSecret("other", "https://other.example", config))
			if _, err := reg.For(context.Background(), Destination{Name: "other"}); err == nil {
				t.Fatalf("expected an error when %s is set", name)
			}
		})
	}
}

func TestIsGCPExec(t *testing.T) {
	if isGCPExec(nil) {
		t.Error("nil exec config must not be treated as gcp")
	}
	if !isGCPExec(&execConfig{Command: "argocd-k8s-auth", Args: []string{"gcp"}}) {
		t.Error("argocd-k8s-auth gcp should be recognised")
	}
	if !isGCPExec(&execConfig{Command: "/usr/local/bin/argocd-k8s-auth", Args: []string{"gcp"}}) {
		t.Error("an absolute path to argocd-k8s-auth should be recognised")
	}
	if isGCPExec(&execConfig{Command: "argocd-k8s-auth", Args: []string{"aws"}}) {
		t.Error("a non-gcp argocd-k8s-auth mode must not be recognised")
	}
	if isGCPExec(&execConfig{Command: "not-argocd-k8s-auth", Args: []string{"gcp"}}) {
		t.Error("only argocd-k8s-auth should receive the backend's Google credentials")
	}
}
