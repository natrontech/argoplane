package tests

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// curlBackend runs an in-cluster curl against an extension backend and
// returns the HTTP status code.
func curlBackend(ctx context.Context, t *testing.T, name, url string) string {
	t.Helper()
	out, err := exec.CommandContext(ctx, "kubectl", "run", name,
		"--rm", "-i", "--restart=Never", "-n", "argocd",
		"--image=curlimages/curl:8.7.1", "--",
		"curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
		"-H", "Argocd-Application-Name: argocd:argoplane-integration-test",
		url,
	).CombinedOutput()
	if err != nil {
		t.Fatalf("in-cluster curl failed: %s: %s", err, out)
	}
	// Output is "<code>pod \"name\" deleted..." — the status code comes first.
	s := strings.TrimSpace(string(out))
	if len(s) < 3 {
		t.Fatalf("unexpected curl output: %q", s)
	}
	return s[:3]
}

// TestExtensions_NamespaceAuthorization verifies the namespace-scoping layer:
// a request for a namespace the Application does not manage must be rejected
// with 403, while the Application's own destination namespace must pass
// authorization (any status but 403).
func TestExtensions_NamespaceAuthorization(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// Skip when the metrics backend is not deployed.
	if err := exec.CommandContext(ctx, "kubectl", "-n", "argocd",
		"get", "service", "argoplane-metrics-backend").Run(); err != nil {
		t.Skip("argoplane-metrics-backend not deployed, skipping")
	}

	// (Re)create the test Application. The authorizer only reads
	// spec.destination.namespace, so no sync wait is needed.
	apply := exec.CommandContext(ctx, "kubectl", "apply", "-f", "-")
	apply.Stdin = strings.NewReader(testAppManifest)
	if out, err := apply.CombinedOutput(); err != nil {
		t.Fatalf("failed to create application: %s: %s", err, out)
	}
	defer func() {
		cleanup := exec.Command("kubectl", "-n", "argocd", "delete", "app",
			"argoplane-integration-test", "--wait=false")
		_ = cleanup.Run()
	}()

	base := "http://argoplane-metrics-backend.argocd.svc:8080/api/v1/resource-metrics"

	code := curlBackend(ctx, t, "argoplane-authz-denied",
		fmt.Sprintf("%s?namespace=kube-system&name=coredns", base))
	if code != "403" {
		t.Errorf("cross-namespace request: expected 403, got %s", code)
	}

	code = curlBackend(ctx, t, "argoplane-authz-allowed",
		fmt.Sprintf("%s?namespace=argoplane-test&name=guestbook-ui", base))
	if code == "403" {
		t.Errorf("own-namespace request: expected authorization to pass, got 403")
	}
}
