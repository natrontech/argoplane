---
name: test
description: Run integration tests against the local kind cluster. Use when the user wants to verify the setup or test changes.
user-invocable: true
argument-hint: "[short|full]"
allowed-tools: Bash(make test*), Bash(cd tests *), Bash(go test *), Read
---

# Run Tests

Run ArgoPlane tests against the local kind cluster.

## Test Modes

### Quick Tests (default if `$ARGUMENTS` is empty or `short`)
```bash
make test-integration-short
```
Runs cluster reachability, ArgoCD status, and config validation tests. Skips long-running application sync tests.

### Full Integration Tests (`full`)
```bash
make test-integration
```
Runs all tests including application sync/cleanup (takes ~30-60 seconds).

## What Tests Verify

- Kind cluster is reachable
- ArgoCD server deployment is ready
- Proxy extensions are enabled in ArgoCD config
- (Full only) ArgoCD can sync an application from GitHub
- (Full only) Application cleanup works

## After Tests

- Check test output for failures
- If cluster is not reachable, run `/dev-setup` first
- If ArgoCD is not configured, run `make setup-argocd`

## Adding New Tests

Add test functions to `tests/argocd_test.go`. Follow existing patterns:
- Use `testing.Short()` to skip long tests in short mode
- Use `kubectl` commands for verification
- Make tests idempotent (safe to run repeatedly)
- Label test resources with `app.kubernetes.io/part-of=argoplane-test`
