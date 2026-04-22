<p align="center">
  <img src="assets/argoplane_logo.svg" alt="ArgoPlane" width="72" height="72">
</p>

<h1 align="center">ArgoPlane</h1>

<p align="center">
  <strong>An ArgoCD extension package. Metrics, logs, backups, network flows, vulnerabilities, and events — all inside ArgoCD.</strong>
</p>

<p align="center">
  <a href="https://github.com/natrontech/argoplane/actions/workflows/ci.yml"><img src="https://github.com/natrontech/argoplane/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/natrontech/argoplane/releases"><img src="https://img.shields.io/github/v/release/natrontech/argoplane?include_prereleases&sort=semver" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
  <a href="https://github.com/natrontech/argoplane/stargazers"><img src="https://img.shields.io/github/stars/natrontech/argoplane" alt="Stars"></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/built%20with-Claude%20Code-blueviolet" alt="Built with Claude Code"></a>
</p>

---

ArgoPlane is a collection of ArgoCD UI extensions. It adds resource tabs, app views, and status panels so developers can see metrics, logs, backups, network flows, vulnerabilities, and events without leaving ArgoCD. Nothing more, nothing less. Each extension is independent and can be installed on its own.

<!-- TODO: Add screenshot of ArgoPlane extensions in ArgoCD -->
<p align="center"><em>Screenshot coming soon.</em></p>

## Extensions

| Category | Extension | What it shows | Status |
|----------|-----------|---------------|--------|
| **Observe** | Metrics | CPU, memory, request rates, latency (Prometheus) | ✅ |
| **Observe** | Backups | Backup status, schedules, restore triggers (Velero) | ✅ |
| **Observe** | Networking | Traffic flows, network policies (Cilium/Hubble) | ✅ |
| **Observe** | Logs | Log search, severity detection, volume charts (Loki) | ✅ |
| **Secure** | Vulnerabilities | Image CVEs, config audit, exposed secrets, SBOM (Trivy Operator) | ✅ |
| **Observe** | Events | Kubernetes events per resource and application | ✅ |
| **Observe** | Alerts | Firing alerts, PrometheusRules, silences (Alertmanager) | Planned |
| **Secure** | Policies | Policy violations, admission results (Kyverno) | Planned |

Each extension is independently toggleable. Install only what you need.

## How it works

Every extension follows the same pattern: a **React/TypeScript UI** registers tabs and views via ArgoCD's extension API, a **Go backend** queries the underlying system (Prometheus, Velero, Loki, etc.), and ArgoCD's **proxy extension** mechanism routes requests from the UI to the backend. Extensions inherit ArgoCD's authentication and RBAC. No extra auth layer required.

```
ArgoCD UI
├── ArgoPlane extensions
│   ├── Resource tabs (per Deployment, Pod, etc.)
│   ├── App views (per Application)
│   └── Status panels (app header)
│
│   React/TS ──proxy──▶ Go backends
│                        ├── Prometheus
│                        ├── Velero
│                        ├── Cilium/Hubble
│                        ├── Loki
│                        ├── Trivy Operator
│                        └── K8s Events API
│
└── ArgoCD RBAC + Dex auth
```

## Installation

**Helm (recommended):**

```sh
helm install argoplane oci://ghcr.io/natrontech/charts/argoplane --version 0.2.0
```

Each extension can be enabled or disabled individually in `values.yaml`. The chart deploys extension backends, proxy configuration, RBAC policies, and UI bundles (via an init container on argocd-server).

See the [deployment docs](services/docs/) for full configuration details.

## Development

```sh
make dev-infra            # Create kind cluster + install ArgoCD (idempotent)
make argocd-password      # Print admin password
make argocd-portforward   # Port-forward UI to localhost:8080
make build-extensions     # Build all UI extension bundles
make reload-extensions    # Rebuild + redeploy all extensions
make test-integration     # Run integration tests
make clean-all            # Destroy everything
make help                 # Show all available targets
```

## Built with AI

ArgoPlane is developed with the help of [Claude Code](https://claude.ai/code), Anthropic's AI coding assistant. We're transparent about this because we believe AI-assisted development is the future, and hiding it helps nobody.

The entire Claude Code configuration is checked into this repo:

| Path | What it does |
|------|-------------|
| [`CLAUDE.md`](CLAUDE.md) | Project context, architecture overview, and development instructions for Claude |
| [`.claude/rules/`](.claude/rules/) | Rule files covering Go, React, architecture, design system, git conventions, and more |
| [`.claude/skills/`](.claude/skills/) | Custom skills: dev setup, extension scaffolding, deployment, testing |

We share this openly so others can learn from our approach to AI-assisted development.

## License

[Apache-2.0](LICENSE)

Built with love from Switzerland by [Natron Tech AG](https://natron.io).
