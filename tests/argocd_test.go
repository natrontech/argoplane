package tests

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"
)

const testAppManifest = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: argoplane-integration-test
  namespace: argocd
  labels:
    app.kubernetes.io/part-of: argoplane-test
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    path: guestbook
    targetRevision: HEAD
  destination:
    server: https://kubernetes.default.svc
    namespace: argoplane-test
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
`

func TestArgoCD_ClusterReachable(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "kubectl", "cluster-info").CombinedOutput()
	if err != nil {
		t.Fatalf("cluster not reachable: %s: %s", err, out)
	}
}

func TestArgoCD_ServerRunning(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "kubectl", "-n", "argocd",
		"get", "deployment", "argocd-server",
		"-o", "jsonpath={.status.readyReplicas}",
	).Output()
	if err != nil {
		t.Fatalf("failed to check argocd-server: %s", err)
	}

	if strings.TrimSpace(string(out)) != "1" {
		t.Fatalf("argocd-server not ready, got replicas: %s", out)
	}
}

func TestArgoCD_ProxyExtensionsEnabled(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "kubectl", "-n", "argocd",
		"get", "configmap", "argocd-cmd-params-cm",
		"-o", "jsonpath={.data.server\\.enable\\.proxy\\.extension}",
	).Output()
	if err != nil {
		t.Fatalf("failed to check proxy extension config: %s", err)
	}

	if strings.TrimSpace(string(out)) != "true" {
		t.Fatalf("proxy extensions not enabled, got: %s", out)
	}
}

func TestArgoCD_ApplicationSync(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// Create namespace (idempotent)
	nsCmd := exec.CommandContext(ctx, "kubectl", "create", "namespace", "argoplane-test",
		"--dry-run=client", "-o", "yaml")
	nsYAML, _ := nsCmd.Output()
	applyNs := exec.CommandContext(ctx, "kubectl", "apply", "-f", "-")
	applyNs.Stdin = strings.NewReader(string(nsYAML))
	if out, err := applyNs.CombinedOutput(); err != nil {
		t.Fatalf("failed to create namespace: %s: %s", err, out)
	}

	// Create application (idempotent)
	cmd := exec.CommandContext(ctx, "kubectl", "apply", "-f", "-")
	cmd.Stdin = strings.NewReader(testAppManifest)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("failed to create application: %s: %s", err, out)
	}

	// Poll for sync status
	deadline := time.Now().Add(2 * time.Minute)
	for time.Now().Before(deadline) {
		out, err := exec.CommandContext(ctx, "kubectl", "-n", "argocd",
			"get", "app", "argoplane-integration-test",
			"-o", "jsonpath={.status.sync.status}:{.status.health.status}",
		).Output()
		if err == nil && string(out) == "Synced:Healthy" {
			t.Log("Application is Synced and Healthy")
			return
		}
		t.Logf("Waiting for sync... current: %s", string(out))
		time.Sleep(3 * time.Second)
	}
	t.Fatal("application did not reach Synced:Healthy within timeout")
}

func TestArgoCD_ApplicationCleanup(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping cleanup in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	// Delete is idempotent: ignore "not found"
	cmd := exec.CommandContext(ctx, "kubectl", "-n", "argocd", "delete", "app",
		"argoplane-integration-test", "--wait=true", "--timeout=60s")
	out, err := cmd.CombinedOutput()
	if err != nil && !strings.Contains(string(out), "not found") {
		t.Fatalf("failed to delete application: %s: %s", err, out)
	}
}
