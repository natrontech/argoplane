# Development Workflow

## Prerequisites

- [kind](https://kind.sigs.k8s.io/) for local Kubernetes clusters
- [kubectl](https://kubernetes.io/docs/tasks/tools/) for cluster interaction
- [helm](https://helm.sh/) for installing operators
- [Node.js 20+](https://nodejs.org/) for building UI extensions
- [Go 1.23+](https://go.dev/) for building backend services

## Local Development Stack

```sh
make dev-infra           # Create kind cluster + install ArgoCD + operators (idempotent)
make argocd-password     # Print admin password
make argocd-portforward  # Port-forward ArgoCD UI to localhost:8080
```

Running `make dev-infra` multiple times is safe. It checks if the cluster exists before creating it, and uses `kubectl apply` / `helm upgrade --install` for all components.

## Building Extensions

```sh
make build-extensions    # Build all UI extension bundles
make load-extensions     # Load extension images into kind cluster
```

Each extension's UI is built with webpack/vite and produces a single `extension.js` bundle. The backend is a Go binary built into a Docker image.

## Integration Tests

```sh
make test-integration          # Full suite against kind cluster
make test-integration-short    # Quick tests (skip long-running ones)
```

Tests are in `tests/` and run against the kind cluster. They create ArgoCD Applications, verify sync status, and test extension backends via the ArgoCD proxy.

## Cluster Lifecycle

```sh
make cluster          # Create kind cluster (idempotent)
make cluster-delete   # Delete kind cluster (idempotent)
make clean            # Remove test resources, keep cluster
make clean-all        # Destroy everything
```

## Verifying Changes

After editing Go backend code, rebuild and redeploy to the kind cluster:

```sh
make build-<extension>   # Build the backend image
make load-<extension>    # Load into kind
make deploy-<extension>  # Apply Kustomize manifests
```

After editing TypeScript extension code, rebuild and restart:

```sh
cd extensions/<name>/ui && npm run build
make load-extensions     # Reload into argocd-server
```

## Paths

Always use absolute literal paths. Never use `$HOME` or `~` in commands.

## Environment Files

`.env` files are gitignored. Each backend service has a `.env.example` documenting required variables.

## Claude: Do Not Start Services

Claude never starts or stops kind clusters, port-forwards, or services. Ask the user to run `make dev-infra` or `make argocd-portforward` if infrastructure needs to be running.
