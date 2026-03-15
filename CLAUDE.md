# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ArgoPlane** is a two-layer developer platform built on ArgoCD:

1. **ArgoCD extensions**: best-in-class operational tools (metrics, logs, backups, alerts, networking, policies, traces) that live inside ArgoCD's UI. These work standalone for power users.
2. **ArgoPlane Portal** (future): a separate developer portal layer that adds platform discoverability, self-service, and aggregated views on top of ArgoCD. Loosely coupled: extensions never depend on the portal.

## Core Idea

Developers deploying through ArgoCD can see if their app is synced. What they can't see: their logs, alerts, backup status, network flows, policy violations, or what the platform offers. ArgoPlane's extensions surface operational visibility inside ArgoCD. The portal (later) adds discoverability and self-service that ArgoCD's extension system can't handle well.

Extensions fall into two categories:

- **Observe**: workload visibility (metrics, logs, traces, backups, alerts, networking, scaling)
- **Secure**: security and compliance (policies, certificates)

## Architecture

### Extension Pattern

Every ArgoPlane feature follows the same pattern:

1. **React/TypeScript UI extension** registered via `window.extensionsAPI` (resource tabs, status panels, system-level pages)
2. **Go backend service** that queries the underlying system (Prometheus, Velero, Cilium, etc.)
3. **ArgoCD proxy extension** that routes `/extensions/<name>/*` requests from the UI to the Go backend

### Key Components

- **ArgoCD v3.3.3**: GitOps engine, UI host, RBAC, proxy extension routing
- **Prometheus**: Metrics and alerts (metrics + alerts extensions)
- **Loki**: Log aggregation (logs extension)
- **Velero**: Backup/restore (backups extension)
- **Cilium/Hubble**: Network visibility (networking extension)
- **Kyverno**: Policy enforcement (policies extension)
- **Tempo/Jaeger**: Distributed tracing (traces extension, future)
- **cert-manager**: Certificate lifecycle (certificates extension, future)

### Multi-Tenancy

ArgoPlane relies on ArgoCD's native RBAC and AppProjects for tenant isolation. No additional auth layer.

### State

No database. All state comes from Kubernetes (ArgoCD Applications, CRDs, operator resources), Prometheus, and Git.

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
  ...
hack/                # Kind cluster, ArgoCD setup, dev scripts
deploy/              # Helm charts, Kustomize overlays
  argocd/            # ArgoCD configuration (ConfigMaps, patches)
  extensions/        # Per-extension deployment manifests
tests/               # Integration tests (Go, against kind cluster)
docs/
  styleguide/        # Multi-page visual reference (open index.html in browser)
  extension-roadmap.md
```

## Current Scope

**Done (Phase 1):** Metrics (Prometheus), Backups (Velero), Networking (Cilium/Hubble)

**Next (Phase 2):** Logs (Loki), Policies (Kyverno), Alerts (Prometheus Rules / Alertmanager)

**Future (Phase 3):** Traces (Tempo/Jaeger), Certificates (cert-manager), Scaling (HPA/KEDA)

**Phase 4:** ArgoPlane Portal (SvelteKit). Platform discoverability, self-service catalog (Crossplane), aggregated views. Planned separately.

See [`docs/extension-roadmap.md`](docs/extension-roadmap.md) for the full phased roadmap.

## Development

```sh
make dev-infra       # Create kind cluster + install ArgoCD (idempotent)
make argocd-password # Print admin password
make argocd-portforward  # Port-forward UI to localhost:8080
make test-integration    # Run integration tests
make clean-all           # Destroy everything
```

## Commands

- `make help` shows all available targets
- `make cluster` creates the kind cluster (idempotent)
- `make argocd` installs ArgoCD in the cluster (idempotent)
- `make dev-infra` sets up the full local stack
- `make build-extensions` builds all UI extension bundles
- `make test-integration` runs integration tests against the kind cluster

## License

AGPL-3.0
