# General Conventions

## Extension Naming

Each extension is a self-contained module under `extensions/<name>/`:

- `extensions/metrics/` - Prometheus metrics integration
- `extensions/backups/` - Velero backup/restore visibility
- `extensions/networking/` - Cilium/Hubble network flows
- `extensions/logs/` - Loki log aggregation (Phase 2)
- `extensions/policies/` - Kyverno policy reports (Phase 2)
- `extensions/alerts/` - Prometheus/Alertmanager alerts (Phase 2)

## Portal Structure

The portal lives at `services/portal/` with two subdirectories:

- `services/portal/frontend/` - SvelteKit + TypeScript + Tailwind v4 + shadcn-svelte
- `services/portal/backend/` - Go HTTP server (REST API, OIDC, K8s, ArgoCD, Git)

## API Naming

Concise, precise, consistent. Use domain terminology.

- **Plural for collections**: `backups`, `metrics`, `scans`
- **Singular for single items**: `backup(id)`, `metric(name)`
- **Action verbs for mutations**: `TriggerBackup`, `RestoreBackup`
- **No obscure abbreviations**: prefer clarity over brevity

### Extension APIs

Served via ArgoCD proxy: `/extensions/<name>/api/v1/...`

### Portal APIs

Served directly by the Go backend: `/api/v1/...`

Groups:
- `/api/v1/auth/*` - OIDC login/callback/logout/me
- `/api/v1/tenants/*` - tenant lifecycle (onboarding, config, membership)
- `/api/v1/catalog/charts` - Helm chart templates (from ConfigMap, for app deployment)
- `/api/v1/catalog/xrds` - Crossplane XRDs (auto-discovered, for platform resources)
- `/api/v1/apps/*` - app management (ArgoCD Application manifests in tenant GitOps repo)
- `/api/v1/resources/*` - platform resources (Crossplane XRD claims in tenant GitOps repo)
- `/api/v1/clusters/*` - cluster listing
- `/api/v1/health` - healthcheck

## Backend Services

### Extension backends

Each extension backend is a Go HTTP server that:

1. Queries the underlying system (Prometheus API, Velero CRDs, etc.)
2. Exposes a JSON HTTP API consumed by the UI extension via ArgoCD's proxy
3. Receives ArgoCD identity headers (`Argocd-Username`, `Argocd-User-Id`, `Argocd-User-Groups`, `Argocd-Target-Cluster-URL`, `Argocd-Target-Cluster-Name`)

### Portal backend

The portal backend is a Go HTTP server that:

1. Handles OIDC auth via Dex (login, callback, session management)
2. Queries K8s API via `client-go` (XRDs, StorageClasses, namespaces, CRDs)
3. Queries ArgoCD REST API (Applications, Projects, RBAC)
4. Commits to two Git repos: onboarding repo (tenant values.yaml) and tenant GitOps repo (ArgoCD Application manifests, Crossplane claims)
5. Serves SvelteKit static files in production

No gRPC. No GraphQL. Plain HTTP/JSON REST.

## Dependency Injection

Through constructors, not globals. Optional parameters via functional options (`With*` pattern).

```go
server, err := metrics.NewServer(
    metrics.WithPrometheusURL(config.PrometheusURL),
    metrics.WithPort(config.Port),
)
```

## File Organization

Feature-based (group by domain), not layer-based. A `backup.go` file contains types, functions, and methods related to backups.

## Configuration

Environment-driven. Never hardcode secrets. Every backend service has a `.env.example` documenting required variables.

## Generated Code

Never manually edit files with `.gen.go` suffix or `generated.go`. Regenerate from source.

## Deployment

**Production: Helm chart** at `deploy/helm/argoplane/`. Deploys extension backends, the portal, services, proxy config, RBAC policies, custom styles, and branding. Each extension is a toggle in `values.yaml`. The portal is a separate Deployment.

**UI extension bundles** are packaged into an init container image (`deploy/docker/Dockerfile.ui-extensions`). This image runs as an init container on argocd-server, copying JS bundles into `/tmp/extensions/`. Build with `make build-ui-extensions-image`.

**Portal** is a single Docker image containing the Go binary and built SvelteKit static files. Build with `deploy/docker/Dockerfile.portal`.

**Development: Makefile** workflow uses `kubectl apply` and `kubectl cp` for fast iteration. Not for production.

- Backend Docker images tagged with git commit hash (or `dev` locally)
- UI extensions init container image: `ghcr.io/natrontech/argoplane-ui-extensions:<version>`
- Portal image: `ghcr.io/natrontech/argoplane-portal:<version>`
- Helm chart handles everything except patching ArgoCD's own ConfigMaps/Deployment (documented in NOTES.txt)
