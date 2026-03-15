# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ArgoPlane** is a suite of ArgoCD UI extensions that makes platform capabilities discoverable to developers. Instead of building a separate portal, ArgoPlane meets developers where they already are: inside ArgoCD.

## Core Idea

Developers deploying through ArgoCD can see if their app is synced. What they can't see: which StorageClasses are available, what IngressClasses exist, which CRDs and operators they can use, what scheduling constraints apply, or what policies are in place. That information lives in the cluster but is invisible without kubectl access and tribal knowledge.

ArgoPlane surfaces all of this inside ArgoCD's UI. Extensions fall into three categories:

- **Discover**: platform capabilities (StorageClasses, IngressClasses, GatewayClasses, CRDs, operators, node pools, scheduling options)
- **Observe**: workload visibility (metrics, logs, traces, backups, scaling, costs)
- **Secure**: security and compliance (vulnerabilities, policies, secrets, certificates)

## Architecture

### Extension Pattern

Every ArgoPlane feature follows the same pattern:

1. **React/TypeScript UI extension** registered via `window.extensionsAPI` (resource tabs, status panels, system-level pages)
2. **Go backend service** that queries the underlying system (Prometheus, Velero, Cilium, etc.)
3. **ArgoCD proxy extension** that routes `/extensions/<name>/*` requests from the UI to the Go backend

### Key Components

- **ArgoCD v3.3.3**: GitOps engine, UI host, RBAC, proxy extension routing
- **Kubernetes API**: Primary source for platform discoverability (StorageClasses, IngressClasses, CRDs, nodes, policies)
- **Crossplane**: Abstraction layer for self-service platform resources (XRDs/compositions)
- **Prometheus**: Metrics source for the metrics extension
- **Velero**: Backup/restore, surfaced via the backups extension
- **Cilium/Hubble**: Network visibility (future)
- **External Secrets Operator**: Secrets management visibility (future)
- **Trivy/Grype**: Image scan results (future)

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

## Current Scope (v0.1)

Building first: **Metrics** (Prometheus) and **Backups** (Velero) extensions.

Next priority: **Platform** extension (system-level page surfacing StorageClasses, IngressClasses, GatewayClasses, CRDs, operators, node pools, scheduling options from the Kubernetes API).

Out of scope for now:
- Self-service catalog / Crossplane XRDs (planned, not started)
- Logs (Loki)
- Security / image scans
- Secrets / External Secrets
- Policies (Kyverno, OPA)
- Image builds (BuildKit, CI status)

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
