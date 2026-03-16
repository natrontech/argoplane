# Extension & Portal Roadmap

All ArgoPlane extensions are named by **domain**, not by the underlying tool. Extensions focus on **Observe** (workload visibility) and **Secure** (security and compliance) categories. The ArgoPlane Portal handles platform discoverability, self-service, team management, and ArgoCD administration.

## Strategy

ArgoPlane is a two-layer developer platform built on ArgoCD:

1. **Extensions** (inside ArgoCD): best-in-class operational tools that attach to resources and applications. They answer: "What's happening with my app?" Resource tabs, app views, status panels, and system-level sidebar pages for cross-cutting dashboards. These work standalone for power users.
2. **Portal** (standalone SvelteKit + Go app): self-service, platform discoverability, team onboarding, RBAC management, and progressive GitOps. It answers: "What does my platform offer, and how do I use it?" Loosely coupled: extensions never depend on the portal.

### Extension vs. Portal: where does a feature belong?

| Belongs in **extensions** (inside ArgoCD) | Belongs in **portal** (standalone app) |
|------------------------------------------|---------------------------------------|
| Per-resource operational data (metrics, logs, traces) | Service catalog and XRD browsing |
| Per-app operational views (backups, networking, alerts) | Team onboarding and management |
| Status panels (health at a glance) | RBAC and AppProject management |
| System-level dashboards (cross-app alerts, cluster health) | Simple app deployment (form to Git to ArgoCD) |
| Resource-scoped actions (trigger backup, restore) | Crossplane claim creation |
| | GitOps repo setup and progressive GitOps |
| | Platform administration |

### ArgoCD Extension Points

ArgoCD v3.x provides six registration methods. ArgoPlane uses all of them:

| Method | Where it appears | Used by |
|--------|-----------------|---------|
| `registerResourceExtension` | Tab on a K8s resource's sliding panel | Metrics, Backups, Networking, Logs, Policies |
| `registerAppViewExtension` | Full-page view in app details | Metrics, Backups, Networking, Alerts |
| `registerStatusPanelExtension` | Compact widget in app header status bar | Metrics, Backups, Networking |
| `registerSystemLevelExtension` | Sidebar page (global, not tied to any app) | ArgoPlane Overview (Phase 2.5) |
| `registerTopBarActionMenuExt` | Action button in top toolbar | Portal link button (Phase 2.5) |
| Application tab (`registerResourceExtension` with `argoproj.io/Application`) | Tab on Application resource | (reserved for future use) |

## Phase 1 (Done)

| Category | Domain | Description | Backend | Extension Points |
|----------|--------|-------------|---------|-----------------|
| Observe | **metrics** | CPU, memory, request rates, latency, custom PromQL queries | Prometheus | Resource tabs (Deployment, StatefulSet, Pod) + App view + Status panel |
| Observe | **backups** | Backup status, schedules, restore triggers, BSL details, pod volume backups | Velero | App view + Status panel + Resource tabs (Schedule, Backup) |
| Observe | **networking** | Traffic flows (Hubble), network policies, app vs platform ownership | Cilium/Hubble | App view + Status panel + Resource tabs (Pod, CiliumNetworkPolicy, CiliumClusterwideNetworkPolicy) |

## Phase 2 (Next)

| Category | Domain | Description | Backend | Extension Points |
|----------|--------|-------------|---------|-----------------|
| Observe | **logs** | Log search, label-based filtering, LogQL queries, live tail, log volume, severity detection | Loki | Resource tabs (Pod, Deployment) + App view |
| Secure | **policies** | Policy violations, admission control results, policy reports per app | Kyverno | Resource tabs + App view + Status panel |
| Observe | **alerts** | Firing/pending alerts, PrometheusRules and AlertmanagerConfigs per app, app vs platform ownership, smart links to Grafana/runbooks/Git | Prometheus Rules API, Alertmanager API | App view + Status panel |

## Phase 2.5 (System-Level Extensions + Portal Bridge)

New extension points that connect ArgoCD to the portal:

| Feature | Extension Point | Description |
|---------|----------------|-------------|
| **ArgoPlane Overview** | `registerSystemLevelExtension` | Sidebar page with aggregated health: all apps' sync status, top alerts, recent failed backups, cluster CPU/memory. Platform engineer's dashboard inside ArgoCD. |
| **Alerts Dashboard** | `registerSystemLevelExtension` | All firing/pending alerts across all apps. Filter by team, namespace, severity. Global view of what's wrong. |
| **Portal Link** | `registerTopBarActionMenuExt` | "ArgoPlane Portal" button in ArgoCD's top toolbar. One click to open the portal. Bridges the two UIs. |

## Phase 3 (Future Extensions)

| Category | Domain | Description | Backend |
|----------|--------|-------------|---------|
| Observe | **traces** | Distributed traces, spans, latency breakdown, trace-to-log correlation | Tempo, Jaeger |
| Secure | **certificates** | TLS certificate expiry warnings, renewal status, issuer details | cert-manager |
| Observe | **scaling** | HPA/VPA status, scaling events, recommendations, KEDA triggers | Kubernetes HPA, KEDA, VPA |

## Phase 4 (ArgoPlane Portal)

A standalone self-service portal built with SvelteKit (frontend) + Go (backend). The portal serves three personas with different needs.

### Architecture

```
Browser → Go backend (:8080)
            ├── /api/v1/*    → REST API (K8s, ArgoCD, OIDC)
            └── /*           → SvelteKit static files (adapter-static)
```

- **Frontend**: SvelteKit + TypeScript + Tailwind CSS v4 + shadcn-svelte
- **Backend**: Go HTTP server (same pattern as extension backends)
- **Auth**: OIDC via ArgoCD's Dex instance (same users, same groups)
- **K8s access**: `client-go` for Crossplane XRDs, platform resources
- **ArgoCD access**: ArgoCD REST API for Applications, Projects, RBAC
- **State**: stateless. No database. All state from K8s, ArgoCD, Git.
- **GitOps**: portal commits to Git, ArgoCD syncs. Never direct `kubectl apply` for app resources.

### Progressive GitOps Model

The portal's core innovation: meet developers where they are and let them grow.

**Level 0 (Portal-managed)**: Developer fills a form (image, port, env vars). Portal generates manifests, commits to a portal-managed Git repo. ArgoCD syncs. Developer doesn't touch YAML.

**Level 1 (Repo-aware)**: Team connects their own Git repo. Portal scaffolds directory structure. ArgoCD Application points at their repo. They start editing YAML.

**Level 2 (GitOps native)**: Team owns everything in Git. Portal is read-only: dashboards, service discovery, status. ArgoCD is their interface.

### Portal Features (MVP)

| Feature | Persona | Pain it solves |
|---------|---------|---------------|
| **Auth via Dex** | All | Same identity as ArgoCD, SSO, groups-based access |
| **Service catalog** | Developers | Browse available XRDs, StorageClasses, IngressClasses, CRDs |
| **Team onboarding** | Team leads, Platform eng | Self-service: namespace + AppProject + RBAC + quotas in one flow |
| **RBAC editor** | Platform eng | Visual editor for `argocd-rbac-cm` instead of manual ConfigMap editing |
| **AppProject management** | Platform eng | CRUD with templates, sensible defaults per team |
| **Simple app deploy** | Developers | Image + port + env → form → Git commit → ArgoCD sync |

### Portal Features (Later)

| Feature | Persona | Description |
|---------|---------|-------------|
| **Crossplane claims** | Developers | Request databases, caches via catalog. Form → Crossplane claim → Git → ArgoCD |
| **Team dashboard** | Team leads | Overview of team's apps, resources, claims, sync status |
| **GitOps repo setup** | DevOps | Connect repo, scaffold structure, create ArgoCD Application |
| **Environment promotion** | Developers | Update image tag in Git for staging/prod promotion |
| **Cluster inventory** | Platform eng | Installed operators, CRDs, node pools, capacity |
| **Audit trail** | Platform eng | Who requested what, when (Git history as audit log) |

### What the Portal Does NOT Do

- **No CI/CD**: building images is GitHub Actions / GitLab CI territory
- **No monitoring dashboards**: that's Grafana. Extensions handle contextual metrics
- **No secret management**: that's External Secrets Operator (maybe a future extension)
- **No direct K8s mutations for apps**: portal commits to Git, ArgoCD reconciles
- **No Backstage**: purpose-built for ArgoCD platforms, not a generic plugin framework

### Portal-Managed Repo Pattern

For Level 0 teams, the portal manages a Git repo:

```
argoplane-managed/
  teams/
    team-alpha/
      apps/
        my-api/
          deployment.yaml
          service.yaml
          ingress.yaml
      claims/
        postgres-main.yaml
      argocd-app.yaml
    team-beta/
      ...
```

ArgoCD watches via app-of-apps. Each team directory is an Application. When teams graduate to Level 1, they migrate to their own repo.

## Not Planned (as extensions)

| Domain | Reason |
|--------|--------|
| **notifications** | ArgoCD already has argocd-notifications |
| **identity** | ArgoCD native RBAC is sufficient; portal adds visual management |
| **gitops** | ArgoCD itself handles this |
| **platform catalog** | Portal feature, not an extension. ArgoCD's extension system is too limited for catalog-style browsing |
| **self-service** | Portal feature. Forms, multi-step wizards, and state don't fit extensions |
| **team management** | Portal feature. Needs its own auth flow and complex state |

## Maybe Later

| Category | Domain | Description | Notes |
|----------|--------|-------------|-------|
| Observe | **databases** | DB health, connections, backups, scaling | CNPG, Percona, Redis Operator |
| Observe | **costs** | Resource cost attribution per app/namespace | Kubecost, OpenCost |
| Secure | **secrets** | Secret sync status, rotation, store health | External Secrets, Vault; ESO already has visibility tools |
| Secure | **security** | Image vulnerabilities, runtime threats | Trivy, Grype, Falco; value depends on scan infrastructure |
| Observe | **builds** | Build status, image tags, pipeline runs | GitHub Actions, GitLab CI, Tekton |

## Design Principles

**Domain-specific APIs.** Each extension backend abstracts the underlying tool behind a domain-specific API. Swapping Prometheus for OTel or Loki for Elasticsearch should only require changing the backend implementation, not the UI or API contract.

**Contextual relevance.** Surface information where it matters. A Pod tab should show that pod's logs and alerts, not a generic search page. App views provide the broader picture.

**App vs platform ownership.** Where applicable (alerts, policies, networking), distinguish between resources the app team deployed and platform-level resources that affect them. This pattern is established in the networking extension and should be reused.

**Smart links.** Connect the dots between systems. An alert should link to its Grafana dashboard, runbook, and source YAML. A policy violation should link to the policy definition. Logs should link to the trace ID.

**Git as the control plane.** The portal never directly creates application-level K8s resources. The flow is always: user action → portal generates YAML → Git commit → ArgoCD sync → Kubernetes. GitOps remains the single source of truth.

**Progressive disclosure.** Don't force GitOps knowledge on day one. Let teams start with forms and grow into owning their Git repos. The portal supports every point on that spectrum.
