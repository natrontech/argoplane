# Development Workflow

## Prerequisites

- [kind](https://kind.sigs.k8s.io/) for local Kubernetes clusters
- [kubectl](https://kubernetes.io/docs/tasks/tools/) for cluster interaction
- [helm](https://helm.sh/) for installing operators
- [Node.js 20+](https://nodejs.org/) for building UI extensions and portal frontend
- [Go 1.26+](https://go.dev/) for building backend services and portal backend

## Local Development Stack

```sh
make dev-infra           # Create kind cluster + install ArgoCD + operators (idempotent)
make argocd-password     # Print admin password
make argocd-portforward  # Port-forward ArgoCD UI to localhost:8080
```

Running `make dev-infra` multiple times is safe. It checks if the cluster exists before creating it, and uses `kubectl apply` / `helm upgrade --install` for all components.

## Building Extensions

```sh
make build-extensions           # Build all UI extension bundles
make build-backends             # Build all backend Docker images
make build-ui-extensions-image  # Build the UI extensions init container image
make load-extensions            # Load backend + UI extensions images into kind
make deploy-extensions          # Deploy backends, UI bundles, and proxy config
```

Each extension's UI is built with webpack/vite and produces a single `extension.js` bundle. The backend is a Go binary built into a Docker image. The UI extensions init container (`deploy/docker/Dockerfile.ui-extensions`) packages all JS bundles for production use as an argocd-server init container.

## Portal Development

The portal has a SvelteKit frontend and Go backend that run separately in dev:

```sh
# Terminal 1: SvelteKit dev server (hot reload, proxies /api/* to :8080)
cd services/portal/frontend && npm run dev    # Runs on :5173

# Terminal 2: Go backend (REST API, OIDC, K8s access)
cd services/portal/backend && go run ./cmd/   # Runs on :8080
```

In development, Vite's proxy config forwards `/api/*` requests to the Go backend. In production, the Go binary serves both the API and the built static files from the same port.

### Portal Prerequisites (in addition to dev stack)

- ArgoCD running with Dex configured (for OIDC auth)
- Dex `staticClient` entry for the portal (id: `argoplane-portal`)
- `.env` file in `services/portal/backend/` with Dex credentials, ArgoCD URL, session secret

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

### Extension changes

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

### Portal changes

Frontend changes: hot-reloaded automatically by Vite dev server.

Backend changes: restart `go run ./cmd/` in the portal backend directory.

## Paths

Always use absolute literal paths. Never use `$HOME` or `~` in commands.

## Environment Files

`.env` files are gitignored. Each backend service has a `.env.example` documenting required variables. The portal backend's `.env.example` documents Dex, ArgoCD, and session configuration.

## Claude: Do Not Start Services

Claude never starts or stops kind clusters, port-forwards, or services. Ask the user to run `make dev-infra` or `make argocd-portforward` if infrastructure needs to be running.
