---
name: dev-setup
description: Set up the local development environment (kind cluster + ArgoCD + operators). Use when the user wants to start developing or needs the dev infrastructure running.
user-invocable: true
allowed-tools: Bash(make *), Bash(kubectl *), Bash(kind *), Bash(helm *)
---

# Development Environment Setup

Set up the full ArgoPlane local development stack. All commands are idempotent.

## Steps

1. Check prerequisites are installed:
   ```bash
   kind version && kubectl version --client && helm version --short && node --version && go version
   ```

2. Create kind cluster and install ArgoCD + operators:
   ```bash
   make dev-infra
   ```

3. Print the admin password:
   ```bash
   make argocd-password
   ```

4. Tell the user to run `make argocd-portforward` in a separate terminal to access the UI at http://localhost:8080.

## If already running

If the cluster already exists, `make dev-infra` is safe to re-run. It will skip creation and update/verify components.

## Troubleshooting

- If a pod is crash-looping: `kubectl -n argocd get pods` and check logs
- If ArgoCD is unreachable: verify kind cluster is running with `kind get clusters`
- If port-forward fails: check if port 8080 is already in use
