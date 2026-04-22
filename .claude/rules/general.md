# General Conventions

## Extension Naming

Each extension is a self-contained module under `extensions/<name>/`:

- `extensions/metrics/` - Prometheus metrics integration
- `extensions/backups/` - Velero backup/restore visibility
- `extensions/networking/` - Cilium/Hubble network flows
- `extensions/logs/` - Loki log aggregation
- `extensions/vulnerabilities/` - Trivy Operator vulnerability scanning
- `extensions/events/` - Kubernetes events
- `extensions/argoplane/` - System-level UI extension (no backend)
- `extensions/policies/` - Kyverno policy reports (planned)
- `extensions/alerts/` - Prometheus/Alertmanager alerts (planned)

## API Naming

Concise, precise, consistent. Use domain terminology.

- **Plural for collections**: `backups`, `metrics`, `scans`
- **Singular for single items**: `backup(id)`, `metric(name)`
- **Action verbs for mutations**: `TriggerBackup`, `RestoreBackup`
- **No obscure abbreviations**: prefer clarity over brevity

Extension APIs are served via ArgoCD's proxy: `/extensions/<name>/api/v1/...`

## Backend Services

Each extension backend is a Go HTTP server that:

1. Queries the underlying system (Prometheus API, Velero CRDs, etc.)
2. Exposes a JSON HTTP API consumed by the UI extension via ArgoCD's proxy
3. Receives ArgoCD identity headers (`Argocd-Username`, `Argocd-User-Id`, `Argocd-User-Groups`, `Argocd-Target-Cluster-URL`, `Argocd-Target-Cluster-Name`)

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

**Production: Helm chart** at `deploy/helm/argoplane/`. Deploys extension backends, services, proxy config, RBAC policies, custom styles, and branding. Each extension is a toggle in `values.yaml`.

**UI extension bundles** are packaged into an init container image (`deploy/docker/Dockerfile.ui-extensions`). This image runs as an init container on argocd-server, copying JS bundles into `/tmp/extensions/`. Build with `make build-ui-extensions-image`.

**Development: Makefile** workflow uses `kubectl apply` and `kubectl cp` for fast iteration. Not for production.

- Backend Docker images tagged with git commit hash (or `dev` locally)
- UI extensions init container image: `ghcr.io/natrontech/argoplane-ui-extensions:<version>`
- Helm chart handles everything except patching ArgoCD's own ConfigMaps/Deployment (documented in NOTES.txt)
