# General Conventions

## Extension Naming

Each extension is a self-contained module under `extensions/<name>/`:

- `extensions/metrics/` - Prometheus metrics integration
- `extensions/backups/` - Velero backup/restore visibility
- `extensions/networking/` - Cilium/Hubble network flows (future)
- `extensions/security/` - Image scan results (future)
- `extensions/secrets/` - External Secrets status (future)

## API Naming

Concise, precise, consistent. Use domain terminology.

- **Plural for collections**: `backups`, `metrics`, `scans`
- **Singular for single items**: `backup(id)`, `metric(name)`
- **Action verbs for mutations**: `TriggerBackup`, `RestoreBackup`
- **No obscure abbreviations**: prefer clarity over brevity

## Backend Services

Each extension backend is a Go HTTP server that:

1. Queries the underlying system (Prometheus API, Velero CRDs, etc.)
2. Exposes a JSON HTTP API consumed by the UI extension via ArgoCD's proxy
3. Receives ArgoCD identity headers (`Argocd-Username`, `Argocd-User-Id`, `Argocd-User-Groups`, `Argocd-Target-Cluster-URL`, `Argocd-Target-Cluster-Name`)

No gRPC between extensions. No GraphQL. Plain HTTP/JSON via ArgoCD proxy.

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

- Docker images tagged with git commit hash
- Kustomize overlays for ArgoCD server patches (init containers, proxy config)
- Helm chart for the full ArgoPlane stack (optional)
