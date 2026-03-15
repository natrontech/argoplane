# ArgoPlane

**Make your platform discoverable. Inside ArgoCD.**

Developers deploying through ArgoCD can see if their app is synced. What they can't see: which StorageClasses are available, what IngressClasses exist, which CRDs and operators they can use, what scheduling constraints apply, what policies are in place, or what observability is configured.

That information exists in the cluster. It's just invisible to anyone without kubectl access and tribal knowledge.

ArgoPlane is a suite of ArgoCD UI extensions that surfaces platform capabilities directly inside the ArgoCD interface. No separate portal. No new auth system. No new UI to learn. If your team already uses ArgoCD, ArgoPlane turns it into a developer portal.

## What It Does

ArgoPlane extends ArgoCD with tabs, status panels, and pages for things ArgoCD doesn't show natively:

**Discover your platform**
- Storage: available StorageClasses, capacity, snapshots, CSI drivers
- Networking: IngressClasses, GatewayClasses, network policies, service mesh visibility
- Compute: node pools, taints, topology constraints, scheduling options
- Services: installed CRDs, operators, self-service resources (Crossplane XRDs)
- Policies: admission control rules, security policies, compliance status

**Observe your workloads**
- Metrics: CPU, memory, request rates, latency (Prometheus)
- Logs: application and container logs, structured search (Loki)
- Traces: distributed traces, latency breakdown (Jaeger, Tempo)
- Backups: backup status, schedules, restore triggers (Velero)

**Secure your apps**
- Security: image vulnerabilities, runtime threats, compliance scans
- Secrets: sync status, rotation schedules, store health
- Certificates: TLS cert status, expiry alerts, auto-renewal

## Architecture

Every extension follows the same pattern:

1. **React/TypeScript UI** registered via ArgoCD's `window.extensionsAPI`
2. **Go backend service** that queries the underlying system
3. **ArgoCD proxy extension** that routes requests from the UI to the backend

No database. All state comes from Kubernetes, Prometheus, and Git. Multi-tenancy through ArgoCD's native RBAC and AppProjects.

## Current Status

Building first: **Metrics** (Prometheus) and **Backups** (Velero) extensions. See [`docs/extension-roadmap.md`](docs/extension-roadmap.md) for what's next.

## Development

```sh
make dev-infra            # Create kind cluster + install ArgoCD (idempotent)
make argocd-password      # Print admin password
make argocd-portforward   # Port-forward UI to localhost:8080
make build-extensions     # Build all UI extension bundles
make test-integration     # Run integration tests
make clean-all            # Destroy everything
make help                 # Show all available targets
```

## License

[AGPL-3.0](LICENSE)
