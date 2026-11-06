package cluster

import (
	"context"
	"encoding/base64"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

// clusterSecret builds the unstructured form of an ArgoCD cluster Secret,
// with data base64-encoded exactly as the API server returns it.
func clusterSecret(name, server, config string) *unstructured.Unstructured {
	return clusterSecretInProject(name, server, config, "")
}

func clusterSecretInProject(name, server, config, project string) *unstructured.Unstructured {
	return namedClusterSecret(name, name, server, config, project)
}

// namedClusterSecret separates the Secret's own name from the cluster name it
// advertises: ArgoCD allows two differently-named Secrets to claim the same
// cluster name, which is the ambiguity this package has to reject.
func namedClusterSecret(secretName, name, server, config, project string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata": map[string]any{
			"name":      secretName,
			"namespace": "argocd",
			"labels":    map[string]any{"argocd.argoproj.io/secret-type": "cluster"},
		},
		"data": map[string]any{
			"name":    base64.StdEncoding.EncodeToString([]byte(name)),
			"server":  base64.StdEncoding.EncodeToString([]byte(server)),
			"config":  base64.StdEncoding.EncodeToString([]byte(config)),
			"project": base64.StdEncoding.EncodeToString([]byte(project)),
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
	// An empty destination is no longer an alias for the hub; it is an error,
	// covered by TestForWithoutDestinationFails.
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

func TestForUnknownClusterFails(t *testing.T) {
	reg, _ := newTestRegistry()

	if _, err := reg.For(context.Background(), Destination{Server: "https://not-registered"}); err == nil {
		t.Fatal("expected an error for a cluster with no Secret")
	}
}

func TestForRejectsUnsupportedAuth(t *testing.T) {
	// An exec plugin this backend cannot run must fail loudly. Falling back to
	// an anonymous client would surface as an empty report list instead.
	reg, _ := newTestRegistry(clusterSecret("aks", "https://aks.example",
		`{"execProviderConfig":{"command":"argocd-k8s-auth","args":["azure"]}}`))

	if _, err := reg.For(context.Background(), Destination{Server: "https://aks.example"}); err == nil {
		t.Fatal("expected an error for an unsupported exec provider")
	}
}

func TestIsGCPExec(t *testing.T) {
	type exec = struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
	}

	if isGCPExec(nil) {
		t.Error("nil exec config must not be treated as gcp")
	}
	if !isGCPExec(&exec{Command: "argocd-k8s-auth", Args: []string{"gcp"}}) {
		t.Error("argocd-k8s-auth gcp should be recognised")
	}
	if isGCPExec(&exec{Command: "argocd-k8s-auth", Args: []string{"aws"}}) {
		t.Error("a non-gcp argocd-k8s-auth mode must not be recognised")
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

func TestForWithoutDestinationFails(t *testing.T) {
	// No destination at all must be an error, never a quiet fall back to the
	// hub's own client answering with the wrong cluster's reports.
	reg, _ := newTestRegistry()

	if _, err := reg.For(context.Background(), Destination{Server: ""}); err == nil {
		t.Fatal("expected an error when the application has no destination")
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
		namedClusterSecret("secret-a", "dup", "https://a.example", `{"bearerToken":"tok"}`, ""),
		namedClusterSecret("secret-b", "dup", "https://b.example", `{"bearerToken":"tok"}`, ""),
	)

	_, err := reg.For(context.Background(), Destination{Name: "dup"})
	if err == nil {
		t.Fatal("expected an error when a name matches several cluster secrets")
	}
}

func TestForHonoursProjectScopedSecret(t *testing.T) {
	// A project-scoped cluster belongs to that project alone; an Application
	// in another project must not read its reports.
	reg, _ := newTestRegistry(clusterSecretInProject("scoped", "https://scoped.example",
		`{"bearerToken":"tok"}`, "team-a"))

	if _, err := reg.For(context.Background(), Destination{Name: "scoped", Project: "team-b"}); err == nil {
		t.Fatal("expected an error for a cluster scoped to another project")
	}

	if _, err := reg.For(context.Background(), Destination{Name: "scoped", Project: "team-a"}); err != nil {
		t.Fatalf("the owning project should resolve it: %v", err)
	}
}

func TestForRequiresNameAndServerToAgree(t *testing.T) {
	// If an Application supplies both, they must describe the same cluster.
	// Matching on either alone would let them disagree and resolve to a
	// cluster the Application never named.
	reg, _ := newTestRegistry(
		clusterSecret("alpha", "https://alpha.example", `{"bearerToken":"tok"}`),
		clusterSecret("beta", "https://beta.example", `{"bearerToken":"tok"}`),
	)

	_, err := reg.For(context.Background(), Destination{Name: "alpha", Server: "https://beta.example"})
	if err == nil {
		t.Fatal("expected an error when name and server point at different clusters")
	}
}

func TestCacheIsNotSharedAcrossProjects(t *testing.T) {
	// Two projects each register their own cluster under the same name. The
	// cache key has to carry the project: keyed on name or server alone, the
	// second project would be handed the first project's client and read its
	// reports.
	reg, _ := newTestRegistry(
		namedClusterSecret("alpha-a", "alpha", "https://alpha-a.example", `{"bearerToken":"a"}`, "team-a"),
		namedClusterSecret("alpha-b", "alpha", "https://alpha-b.example", `{"bearerToken":"b"}`, "team-b"),
	)

	a, err := reg.For(context.Background(), Destination{Name: "alpha", Project: "team-a"})
	if err != nil {
		t.Fatalf("team-a lookup failed: %v", err)
	}
	b, err := reg.For(context.Background(), Destination{Name: "alpha", Project: "team-b"})
	if err != nil {
		t.Fatalf("team-b lookup failed: %v", err)
	}
	if a == b {
		t.Error("each project must get its own client, not a shared cache entry")
	}
}
