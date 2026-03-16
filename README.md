<p align="center">
  <img src="assets/argoplane_logo.svg" alt="ArgoPlane" width="72" height="72">
</p>

<h1 align="center">ArgoPlane</h1>

<p align="center">
  <strong>From "I have a container" to GitOps power user. All through ArgoCD.</strong>
</p>

<p align="center">
  <a href="https://github.com/natrontech/argoplane/actions/workflows/ci.yml"><img src="https://github.com/natrontech/argoplane/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/natrontech/argoplane/releases"><img src="https://img.shields.io/github/v/release/natrontech/argoplane?include_prereleases&sort=semver" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0"></a>
  <a href="https://github.com/natrontech/argoplane/stargazers"><img src="https://img.shields.io/github/stars/natrontech/argoplane" alt="Stars"></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/built%20with-Claude%20Code-blueviolet" alt="Built with Claude Code"></a>
</p>

---

Your platform team built a great Kubernetes platform. ArgoCD deploys everything. Prometheus, Velero, Cilium, Crossplane, Kyverno are all running. But three problems remain:

**Developers can't see what's happening.** Their app is synced, but what about CPU usage? Backup status? Network flows? Policy violations? That data exists in a dozen tools. Nobody opens them.

**Developers can't see what's available.** What StorageClasses exist? Which databases can they request? What CRDs does the platform offer? That information lives in tribal knowledge and Confluence pages nobody reads.

**Platform engineers can't easily manage the platform.** Onboarding a new team means six manual steps across three ConfigMaps. RBAC is a YAML file everyone is afraid to edit. There's no self-service. Every request is a Slack message.

ArgoPlane fixes all three.

## Two Layers, One Platform

### Layer 1: Extensions (inside ArgoCD)

ArgoCD extensions that surface operational data where developers already work. Resource tabs, app views, status panels, and sidebar dashboards. No new UI to learn.

| Category | Extension | What it shows |
|----------|-----------|---------------|
| **Observe** | Metrics | CPU, memory, request rates, latency (Prometheus) |
| **Observe** | Backups | Backup status, schedules, restore triggers (Velero) |
| **Observe** | Networking | Traffic flows, network policies (Cilium/Hubble) |
| **Observe** | Logs | Log search, live tail, severity detection (Loki) |
| **Observe** | Alerts | Firing alerts, PrometheusRules, silences (Alertmanager) |
| **Secure** | Policies | Policy violations, admission results (Kyverno) |

Extensions answer: **"What's happening with my app right now?"**

Power users who live in ArgoCD get everything they need without leaving.

### Layer 2: Portal (standalone)

A self-service portal for everything ArgoCD's extension system can't handle: browsing catalogs, filling forms, managing teams, editing RBAC.

| Feature | Who it's for | What it does |
|---------|-------------|--------------|
| **Service catalog** | Developers | Browse available databases, storage, ingress options. Request resources through forms. |
| **Simple app deploy** | Developers | "I have a container image, run it." Portal generates the YAML, commits to Git, ArgoCD syncs. |
| **Team onboarding** | Team leads | Self-service: one click creates namespace, AppProject, RBAC, quotas. |
| **RBAC editor** | Platform eng | Visual editor for ArgoCD policies. Stop hand-editing ConfigMaps. |
| **AppProject management** | Platform eng | CRUD with templates. Sensible defaults per team. |

The portal answers: **"What does my platform offer, and how do I use it?"**

## Progressive GitOps

This is the core idea. Not everyone starts as a GitOps expert. ArgoPlane meets developers where they are:

**Start simple.** A developer fills a form: container image, port, environment variables. The portal generates Kubernetes manifests, commits them to Git, and ArgoCD syncs. The developer sees their app running. They never touched YAML.

**Grow gradually.** The team connects their own Git repo. The portal scaffolds the directory structure. They start editing manifests, learning the patterns. ArgoCD syncs from their repo.

**Own it completely.** The team manages everything in Git. The portal is read-only for them: dashboards, service discovery, status. ArgoCD is their interface. They're GitOps natives.

The Git repo always exists. At every level, GitOps is the source of truth. The portal is just the on-ramp.

## Architecture

```
ArgoCD UI                          ArgoPlane Portal
├── ArgoPlane extensions           ├── SvelteKit frontend
│   ├── Resource tabs              │   ├── Service catalog
│   ├── App views                  │   ├── App deploy wizard
│   ├── Status panels              │   ├── Team management
│   └── Sidebar dashboards         │   └── RBAC editor
│                                  │
│   React/TS ──proxy──▶ Go        │   SvelteKit ──▶ Go backend
│                      backends    │                  ├── OIDC (Dex)
│                      ├── Prom    │                  ├── K8s API
│                      ├── Velero  │                  ├── ArgoCD API
│                      └── Hubble  │                  └── Git
│                                  │
└── ArgoCD RBAC + Dex auth         └── Same Dex, same groups
```

No database. All state comes from Kubernetes, ArgoCD, Prometheus, and Git. Same Dex instance, same OIDC groups, same RBAC model. One Helm chart deploys everything.

## Why not Backstage?

Backstage is a developer portal framework for organizations with 50+ tools to unify. You "build your Backstage," then spend months writing plugins and managing PostgreSQL, Node.js backends, and monthly breaking upgrades.

ArgoPlane is purpose-built for ArgoCD platforms. Extensions live inside ArgoCD (Backstage can't do that). The portal is a single Go binary with no database. Same auth as ArgoCD. Same design. If your platform is ArgoCD-centric, ArgoPlane is the natural fit, not a generic framework you configure for months.

## Current Status

**Done:** Metrics, Backups, Networking extensions

**Building:** Logs, Policies, Alerts extensions + system-level dashboards

**Next:** Portal (auth, service catalog, team onboarding, RBAC editor, simple app deploy)

See [`docs/extension-roadmap.md`](docs/extension-roadmap.md) for the full roadmap.

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

## Built with AI

ArgoPlane is developed with the help of [Claude Code](https://claude.ai/code), Anthropic's AI coding assistant. We're transparent about this because we believe AI-assisted development is the future, and hiding it helps nobody.

The entire Claude Code configuration is checked into this repo:

| Path | What it does |
|------|-------------|
| [`CLAUDE.md`](CLAUDE.md) | Project context, architecture overview, and development instructions for Claude |
| [`.claude/rules/`](.claude/rules/) | Rule files covering Go, React, architecture, design system, portal, git conventions, and more |
| [`.claude/skills/`](.claude/skills/) | Custom skills: dev setup, extension scaffolding, deployment, testing, portal backend, SvelteKit scaffolding |

We share this openly so others can learn from our approach to AI-assisted development, and to contribute back to the community's understanding of how to work effectively with AI coding tools.

This is also one of the reasons we chose AGPL-3.0: everything is in the open, including how we build it.

## License

[AGPL-3.0](LICENSE)

Built with love from Switzerland by [Natron Tech AG](https://natron.io).
