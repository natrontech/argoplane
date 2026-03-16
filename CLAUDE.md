# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ArgoPlane** is a two-layer developer platform built on ArgoCD:

1. **ArgoCD extensions**: best-in-class operational tools (metrics, logs, backups, alerts, networking, policies, traces) that live inside ArgoCD's UI. Resource tabs, app views, status panels, and system-level sidebar pages. These work standalone for power users.
2. **ArgoPlane Portal**: a standalone self-service platform (SvelteKit + Go) that adds platform discoverability, self-service, team onboarding, RBAC management, and progressive GitOps on top of ArgoCD. Loosely coupled: extensions never depend on the portal.

## Core Idea

Developers deploying through ArgoCD can see if their app is synced. What they can't see: their logs, alerts, backup status, network flows, policy violations, or what the platform offers. Platform engineers can't easily onboard teams or make their platform services discoverable.

**Extensions** (inside ArgoCD) surface operational visibility: "What's happening with my app?"
**Portal** (standalone) adds self-service and management: "What does my platform offer, and how do I use it?"

The portal builds on the **tenant chart pattern**: a platform team defines a tenant Helm chart (guardrails: namespace, AppProject, policies, quotas) and each tenant gets their own GitOps repo for apps (via a common Helm chart) and platform resources (via Crossplane XRD claims). The portal is a UI that generates manifests and commits to Git. ArgoCD does the rest.

Extensions fall into two categories:

- **Observe**: workload visibility (metrics, logs, traces, backups, alerts, networking, scaling)
- **Secure**: security and compliance (policies, certificates)

## Architecture

### Extension Pattern

Every ArgoPlane extension follows the same pattern:

1. **React/TypeScript UI extension** registered via `window.extensionsAPI` (resource tabs, status panels, system-level pages, app views, top bar actions)
2. **Go backend service** that queries the underlying system (Prometheus, Velero, Cilium, etc.)
3. **ArgoCD proxy extension** that routes `/extensions/<name>/*` requests from the UI to the Go backend

### Portal Pattern

The portal is a single Go binary that serves the SvelteKit frontend and REST API:

1. **SvelteKit frontend** (TypeScript + Tailwind v4 + shadcn-svelte) built as static files
2. **Go backend** that serves the API and static files from the same port
3. **Auth via Dex**: OIDC against ArgoCD's Dex instance (same users, same groups)
4. **Git as control plane**: portal commits manifests to Git, ArgoCD syncs

### Key Components

- **ArgoCD v3.3.3**: GitOps engine, UI host, RBAC, proxy extension routing
- **Dex**: OIDC provider (bundled with ArgoCD), shared by ArgoCD and the portal
- **Prometheus**: Metrics and alerts (metrics + alerts extensions)
- **Loki**: Log aggregation (logs extension)
- **Velero**: Backup/restore (backups extension)
- **Cilium/Hubble**: Network visibility (networking extension)
- **Kyverno**: Policy enforcement (policies extension)
- **Crossplane**: Platform resource abstraction (XRD claims for databases, caches, registries in tenant GitOps repos)
- **Tempo/Jaeger**: Distributed tracing (traces extension, future)
- **cert-manager**: Certificate lifecycle (certificates extension, future)

### Multi-Tenancy

Extensions: ArgoCD's native RBAC and AppProjects for tenant isolation.
Portal: Two-repo model. A **tenant onboarding repo** (platform-managed) holds per-tenant `values.yaml` files discovered by an ApplicationSet. Each tenant gets a **GitOps repo** (tenant-owned) for apps and platform resources. OIDC groups from Dex map to roles in the tenant's AppProject.

### State

No database. All state comes from Kubernetes (ArgoCD Applications, CRDs, operator resources), Prometheus, Git, and Dex.

## Monorepo Structure

```
design-system/       # Cross-platform CSS design tokens and component library
  tokens.css         # CSS custom properties (single source of truth)
  base.css           # Reset, typography, element defaults
  components.css     # .ap-* component classes
  utilities.css      # Layout, spacing, typography helpers
  argoplane.css      # All-in-one import
extensions/
  shared/            # @argoplane/shared: React components + TS token re-exports
  metrics/
    ui/              # React/TypeScript extension bundle
    backend/         # Go service querying Prometheus
  backups/
    ui/
    backend/         # Go service querying Velero
  networking/
    ui/
    backend/         # Go service querying Cilium/Hubble
  ...
services/
  portal/
    frontend/        # SvelteKit + Tailwind v4 + shadcn-svelte
    backend/         # Go HTTP server (REST API, OIDC, K8s, ArgoCD, Git)
  docs/              # Documentation site (SvelteKit + mdsvex)
deploy/
  helm/argoplane/    # Helm chart for production deployment
  docker/            # Dockerfiles (UI extensions init container, portal)
  argocd/            # ArgoCD configuration (styles, proxy config, branding)
  extensions/        # Per-extension deployment manifests (dev)
hack/                # Kind cluster, ArgoCD setup, dev scripts
tests/               # Integration tests (Go, against kind cluster)
docs/
  styleguide/        # Multi-page visual reference (open index.html in browser)
  extension-roadmap.md
```

## Current Scope

**Done (Phase 1):** Metrics (Prometheus), Backups (Velero), Networking (Cilium/Hubble)

**Next (Phase 2):** Logs (Loki), Policies (Kyverno), Alerts (Prometheus Rules / Alertmanager)

**Phase 2.5:** System-level extensions (ArgoPlane Overview sidebar page, Alerts Dashboard, Portal link button)

**Future (Phase 3):** Traces (Tempo/Jaeger), Certificates (cert-manager), Scaling (HPA/KEDA)

**Phase 4:** ArgoPlane Portal (SvelteKit + Go). Auth via Dex, tenant onboarding (values.yaml to onboarding repo), service catalog (Helm chart templates + Crossplane XRDs), app deployment (common Helm chart via ArgoCD Application manifests), platform resource requests (XRD claims), team membership (OIDC groups to roles), progressive GitOps (Level 0 forms to Level 2 full Git ownership).

See [`docs/extension-roadmap.md`](docs/extension-roadmap.md) for the full phased roadmap.

## Development

```sh
make dev-infra       # Create kind cluster + install ArgoCD (idempotent)
make argocd-password # Print admin password
make argocd-portforward  # Port-forward UI to localhost:8080
make test-integration    # Run integration tests
make clean-all           # Destroy everything
```

### Portal Development

```sh
# Terminal 1: SvelteKit dev server
cd services/portal/frontend && npm run dev    # :5173, proxies /api to :8080

# Terminal 2: Go backend
cd services/portal/backend && go run ./cmd/   # :8080
```

## Commands

- `make help` shows all available targets
- `make cluster` creates the kind cluster (idempotent)
- `make argocd` installs ArgoCD in the cluster (idempotent)
- `make dev-infra` sets up the full local stack
- `make build-extensions` builds all UI extension bundles
- `make build-backends` builds all backend Docker images
- `make build-ui-extensions-image` builds the UI extensions init container image
- `make load-extensions` loads backend + UI extensions images into kind
- `make deploy-extensions` deploys backends, UI bundles, and proxy config
- `make test-integration` runs integration tests against the kind cluster

## Deployment

For production, use the Helm chart at `deploy/helm/argoplane/`. It deploys extension backends, the portal, proxy config, RBAC, styles, and branding ConfigMaps. UI bundles are loaded via an init container image (`deploy/docker/Dockerfile.ui-extensions`). See `services/docs/` for full deployment and ArgoCD configuration docs.

## License

AGPL-3.0
