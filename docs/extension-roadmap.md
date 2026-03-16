# Extension & Portal Roadmap

All ArgoPlane extensions are named by **domain**, not by the underlying tool. Extensions focus on **Observe** (workload visibility) and **Secure** (security and compliance) categories. The ArgoPlane Portal handles platform discoverability, self-service, team management, and ArgoCD administration.

## Strategy

ArgoPlane is a two-layer developer platform built on ArgoCD:

1. **Extensions** (inside ArgoCD): best-in-class operational tools that attach to resources and applications. They answer: "What's happening with my app?" Resource tabs, app views, status panels, and system-level sidebar pages for cross-cutting dashboards. These work standalone for power users.
2. **Portal** (standalone SvelteKit + Go app): self-service, platform discoverability, team onboarding, RBAC management, and progressive GitOps. It answers: "What does my platform offer, and how do I use it?" Loosely coupled: extensions never depend on the portal.

### Extension vs. Portal: where does a feature belong?

| Belongs in **extensions** (inside ArgoCD) | Belongs in **portal** (standalone app) |
|------------------------------------------|---------------------------------------|
| Per-resource operational data (metrics, logs, traces) | Tenant onboarding (generate values.yaml, commit to onboarding repo) |
| Per-app operational views (backups, networking, alerts) | Service catalog (browse Helm chart templates and Crossplane XRDs) |
| Status panels (health at a glance) | Team membership (assign OIDC groups to AppProject roles) |
| System-level dashboards (cross-app alerts, cluster health) | Simple app deployment (pick template, fill form, portal commits Application manifest to tenant GitOps repo) |
| Resource-scoped actions (trigger backup, restore) | Tenant dashboard (apps, sync status, resources) |
| | Progressive GitOps (portal-managed to full ownership) |

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

Progressive GitOps levels are emergent, not explicit tiers that teams select. They describe a natural progression based on how teams interact with their GitOps repo.

**Level 0 (Portal-managed)**: All resources in the tenant GitOps repo carry the `argoplane.io/managed-by: portal` annotation. Developers use forms exclusively. Portal creates the GitOps repo, generates all manifests, and commits on their behalf.

**Level 1 (Mixed ownership)**: Some resources have the portal annotation, others are hand-written by the team. Developers use the portal for quick deployments and edit YAML directly for fine-tuned control. Both coexist.

**Level 2 (GitOps native)**: No portal annotations remain. The portal is read-only: dashboards, service discovery, status. The team owns everything in Git. ArgoCD is their interface.

### The Two-Repo Model

The portal operates across two Git repositories per tenant:

**Tenant onboarding repo** (platform-managed, shared across all tenants):
Contains `tenants/<cluster>/<name>/values.yaml` files. An ApplicationSet with a git file generator discovers tenant directories and creates ArgoCD Applications that render the tenant Helm chart. The portal commits here for onboarding and tenant configuration changes.

**Tenant GitOps repo** (per-tenant, tenant-owned):
Contains the tenant's application manifests and platform resource claims. The tenant Helm chart creates a root ArgoCD Application pointing at this repo. Developers (or the portal on their behalf) commit here for app deployments and resource requests.

```
tenant-onboarding-repo/                    tenant-gitops-repo/  (per tenant)
  clusters/                                  apps/
    prod-cluster-01/                           my-api.yaml          # ArgoCD Application → common Helm chart + values
      tenants-appset.yaml                      my-worker.yaml       # ArgoCD Application → common Helm chart + values
      tenants-project.yaml                   resources/
  tenants/                                     postgres-main/
    prod-cluster-01/                             claim.yaml         # Crossplane XRD claim
      base-values.yaml                         redis-cache/
      team-alpha/                                claim.yaml         # Crossplane XRD claim
        values.yaml
      team-beta/
        values.yaml
```

### The Tenant Chart Pattern

The portal builds on a proven pattern: **tenant Helm charts** with **ApplicationSet discovery**.

The platform team maintains a tenant Helm chart that creates guardrails for each tenant: namespace (with Pod Security Standards labels), AppProject (with resource whitelists and role definitions), RBAC (group-to-role mappings), baseline network policies (Cilium), resource quotas, Kyverno policy bindings, AlertmanagerConfig, and a root ArgoCD Application pointing at the tenant's GitOps repo.

The tenant chart does NOT create platform resources like Crossplane claims, databases, registries, or similar. Those are self-service: developers request them by committing Crossplane XRD claims to the `resources/` directory in their tenant GitOps repo.

**Onboarding a tenant = creating a directory with a values.yaml in the onboarding repo and committing.**

### App Deployment via Common Helm Chart

Applications are deployed as ArgoCD Application manifests in the tenant GitOps repo. Each Application manifest references an external common Helm chart (e.g., bedag/common or a platform-maintained chart published to an OCI registry). The Application manifest specifies the chart reference and per-app values (image, port, replicas, env vars, etc.).

The portal generates these Application manifests: the developer picks an app template (web-app, worker, cron-job), fills a form, and the portal writes an Application YAML to `apps/<name>.yaml` in the tenant GitOps repo. Power users create and edit these manifests directly.

### Service Catalog

The service catalog has two discovery mechanisms:

**Helm chart templates**: curated by the platform team in a ConfigMap (`argoplane-catalog-charts`). Each entry has a display name, description, chart reference (OCI registry URL + version), category, and default values. These represent the app templates developers pick from when deploying (web-app, worker, cron-job, etc.).

**Crossplane XRDs**: auto-discovered from the Kubernetes API. The portal lists XRDs that carry the `argoplane.io/catalog: "true"` label and cross-references each XRD's group/kind against the tenant's AppProject resource whitelist. Developers only see XRDs their tenant is allowed to claim. Selecting an XRD opens a form; submitting commits a claim YAML to `resources/<name>/claim.yaml` in the tenant GitOps repo.

### GitOps Repo Connection

ArgoCD repocreds (GitHub App) provide org-wide repository access. The portal can create repos for Level 0 teams (full auto-provisioning) or accept user-provided repo URLs. The tenant chart references the repo URL from the tenant's `values.yaml` and creates the root ArgoCD Application pointing at it.

### Annotation-Based Ownership

Portal-generated resources carry the `argoplane.io/managed-by: portal` annotation. The portal only writes to resources it annotated. It never overwrites resources without this annotation.

Users can take ownership of any portal-managed resource by removing the annotation. Once the annotation is gone, the portal treats that resource as read-only. This is how teams naturally progress from Level 0 to Level 2: they gradually take ownership of individual resources until none carry the portal annotation.

### Ownership Model

The portal provides:

```
Platform team owns:                           Portal provides:
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│ Tenant Helm chart                    │    │ Form that generates values.yaml      │
│   (guardrails: ns, AppProject, RBAC, │    │   (what THIS tenant gets)            │
│    quotas, net policies, Kyverno)    │    │                                      │
│                                      │    │ Tenant onboarding wizard             │
│ Common app Helm chart                │    │   → fill form                        │
│   (maintained + published to OCI)    │    │   → generate values.yaml             │
│                                      │    │   → commit to onboarding repo        │
│ Catalog ConfigMap                    │    │   → ApplicationSet picks it up       │
│   (argoplane-catalog-charts)         │    │                                      │
│                                      │    │ App deployment forms                 │
│ ApplicationSet                       │    │   → pick chart template from catalog │
│   (discovers tenant dirs)            │    │   → fill form (image, port, env)     │
│                                      │    │   → generate Application manifest    │
│ ArgoCD repocreds (GitHub App)        │    │   → commit to tenant GitOps repo     │
│   (org-wide repo access)             │    │                                      │
│                                      │    │ Platform resource request forms      │
│ base-values.yaml per cluster         │    │   → pick XRD from catalog            │
│   (cluster-level defaults)           │    │   → fill form                        │
│                                      │    │   → generate claim YAML              │
│ Role definitions                     │    │   → commit to tenant GitOps repo     │
│ Resource whitelists                  │    │                                      │
│ Network policy templates             │    │ Team membership management           │
│ Crossplane compositions + XRDs       │    │   → assign OIDC groups to roles      │
│                                      │    │   → scoped to own tenant             │
│                                      │    │   → update values.yaml + commit      │
└──────────────────────────────────────┘    └──────────────────────────────────────┘
```

**Platform team** (owns the structure):
- Defines the tenant Helm chart (guardrails: namespace, AppProject, RBAC, quotas, net policies, Kyverno bindings, AlertmanagerConfig, root Application)
- Maintains the common app Helm chart and publishes it to an OCI registry
- Curates the catalog ConfigMap (`argoplane-catalog-charts`) with chart templates
- Defines role templates (viewer, developer, admin) and their permissions
- Sets resource whitelists, network policy templates, Crossplane compositions and XRDs
- Manages base-values.yaml per cluster (cluster-level defaults)
- Maintains the ApplicationSet configuration
- Configures ArgoCD repocreds (GitHub App) for org-wide repo access

**Team leads** (self-service within guardrails):
- Manage team membership: assign OIDC groups to roles within their tenant's AppProject
- View tenant status: apps, sync status, resources, quotas
- This is scoped: team leads can only manage their own tenant

**Developers** (consume platform services):
- Deploy apps via common Helm chart forms (pick template, fill values, portal generates Application manifest in tenant GitOps repo)
- Request platform resources via Crossplane XRD claim forms (portal generates claim YAML in tenant GitOps repo)
- Browse the service catalog (Helm chart templates and Crossplane XRDs available to their tenant)

### Tenant values.yaml Structure

```yaml
name: team-alpha
displayName: "Team Alpha"
cluster: prod-cluster-01

roles:
  admin:
    groups: ["oidc:team-alpha-leads"]
  developer:
    groups: ["oidc:team-alpha-devs"]
  viewer:
    groups: ["oidc:team-alpha-viewers"]

gitopsRepo:
  url: "https://github.com/my-org/team-alpha-apps.git"
  branch: "main"
  path: "."

quotas:
  cpu: "20"
  memory: "40Gi"
  pods: "50"

networkPolicies:
  denyAllIngress: true
  allowDNS: true
  allowIntraNamespace: true
  allowFromMonitoring: true

podSecurityStandard: restricted

allowedResources:
  - group: postgresql.platform.example.com
    kind: PostgreSQLInstance
  - group: redis.platform.example.com
    kind: RedisInstance
```

### Portal Feature Tiers

#### Tier 1: Core Self-Service (MVP)

| Feature | Persona | Pain it solves |
|---------|---------|---------------|
| **Auth via Dex** | All | Same identity as ArgoCD, SSO, groups-based access |
| **Tenant dashboard** | Team leads | Summary cards (apps, sync status, alerts), recent activity, quota usage |
| **Tenant onboarding** | Platform eng, Team leads | Wizard: fill form, generate values.yaml, commit to onboarding repo. Namespace, AppProject, RBAC, quotas, network policies, Kyverno bindings: all from one commit. |
| **Service catalog** | Developers | Browse Helm chart templates (ConfigMap) AND Crossplane XRDs (auto-discovered, `argoplane.io/catalog: "true"` label, filtered by tenant's AppProject whitelist). |
| **Team membership** | Team leads | Assign OIDC groups to roles within your tenant's AppProject. Self-service, scoped. |
| **App deployment** | Developers | Wizard: pick template (web-app, worker, cron-job), configure (image, port, env), review YAML diff, commit Application manifest to tenant GitOps repo. |
| **Resource request** | Developers | Wizard: pick XRD from catalog, fill form from OpenAPI schema, review claim YAML, commit to tenant GitOps repo. |
| **App management** | Developers | View, edit values (drawer), scale (replicas), delete. YAML view. Sync status. |

#### Tier 2: Aggregated Operations

Extensions show per-resource data inside ArgoCD. The portal shows the big picture across all apps in a tenant.

| Feature | Persona | Data Source | Description |
|---------|---------|-------------|-------------|
| **Sync overview** | All | ArgoCD API | Cross-app sync status on dashboard. Filterable, sortable. |
| **Alert overview** | Team leads, Devs | Alertmanager API | All firing/pending alerts across tenant apps. Silence, acknowledge. |
| **Backup overview** | Team leads | Velero API via K8s | Backup status across all apps. Trigger backup from portal. |
| **Activity feed** | All | Git history (both repos) | Who deployed what, when. Git commits as audit trail. |
| **Resource status** | Devs | Crossplane status via K8s | All platform resources with provisioning status. |
| **Metrics summary** | All | Prometheus API | Tenant-scoped CPU/memory/request summary cards on dashboard. |

#### Tier 3: Platform Intelligence (Later)

| Feature | Persona | Data Source | Description |
|---------|---------|-------------|-------------|
| **CI/CD pipeline status** | Devs | GitHub Actions / GitLab CI API | Last build status, duration. Discovered via `argoplane.io/ci-url` annotation. |
| **Image info** | Devs | Container registry API (Harbor, GHCR) | Image tag, vulnerabilities, size. Via `argoplane.io/registry-url` annotation. |
| **Cost overview** | Team leads, Platform eng | OpenCost / Kubecost API | Per-tenant, per-app resource cost attribution. |
| **Environment promotion** | Devs | Git API | Promote image tag from staging to prod (commit to GitOps repo). |
| **Rollback** | Devs | Git API | Revert to previous image tag (Git revert commit). |
| **GitOps repo creation** | Devs | GitHub/GitLab API | Level 0 auto-provisioning: create repo, scaffold dirs, configure tenant values. |
| **Cluster inventory** | Platform eng | K8s API | Installed operators, CRDs, node pools, capacity. |

#### Tier 4: Security and Compliance (Later)

| Feature | Persona | Data Source | Description |
|---------|---------|-------------|-------------|
| **Policy overview** | Team leads | Kyverno PolicyReports | Cross-app policy violations, compliance score per tenant. |
| **Image scanning** | Devs, Security | Harbor/Trivy API | Vulnerability summary per deployed image. |
| **Runtime security** | Security, Platform eng | Falco API | Runtime alerts, suspicious activity per tenant. |
| **Certificate status** | Platform eng | cert-manager via K8s | TLS cert expiry, renewal status across tenant. |
| **Audit log** | All | Git history + K8s events | Comprehensive audit trail of all changes. |

#### Feature Discovery via Annotations

The portal reads annotations on ArgoCD Applications to discover integrations:

```yaml
argoplane.io/ci-url: "https://github.com/org/repo/actions"
argoplane.io/registry-url: "harbor.example.com/team/app"
argoplane.io/grafana-url: "https://grafana.example.com/d/abc"
argoplane.io/docs-url: "https://docs.example.com/app"
argoplane.io/runbook-url: "https://wiki.example.com/runbooks/app"
```

No hardcoded integrations. Platform teams annotate what they want visible.

### What the Portal Does NOT Do

- **No CI/CD execution**: shows status from annotations, but building images is GitHub Actions / GitLab CI territory
- **No deep monitoring**: that's Grafana. Portal shows summary metrics; extensions show per-resource detail
- **No secret management**: that's External Secrets Operator, handled by the platform team outside the tenant chart pattern
- **No direct K8s mutations for apps**: portal commits to Git, ArgoCD reconciles
- **No RBAC policy editing**: platform team owns role definitions in the tenant chart. Portal only manages group-to-role assignments within existing roles.
- **No Backstage**: purpose-built for ArgoCD platforms, not a generic plugin framework
- **No tenant chart editing**: portal only generates values.yaml for the onboarding repo and manifests for the tenant GitOps repo. The tenant Helm chart is platform team territory.
- **No common chart editing**: platform team owns the common app Helm chart. Portal only fills in values when generating Application manifests.

## Not Planned (as extensions)

| Domain | Reason |
|--------|--------|
| **notifications** | ArgoCD already has argocd-notifications |
| **identity** | ArgoCD native RBAC is sufficient; tenant chart defines roles |
| **gitops** | ArgoCD itself handles this |
| **platform catalog** | Portal feature, not an extension. ArgoCD's extension system is too limited for catalog-style browsing |
| **self-service** | Portal feature. Forms, multi-step wizards, and state don't fit extensions |
| **tenant management** | Portal feature. Generates values.yaml and commits to tenant onboarding repo |
| **RBAC editing** | Platform team owns role definitions in the tenant chart. Portal only manages group-to-role assignments within tenants. |

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

**Git as the control plane.** The portal never directly creates application-level K8s resources. The flow is always: user action, portal generates YAML, Git commit, ArgoCD sync, Kubernetes. GitOps remains the single source of truth.

**Progressive disclosure.** Don't force GitOps knowledge on day one. Let teams start with forms and grow into owning their Git repos. The portal supports every point on that spectrum.

**Annotation-based ownership.** Portal-generated resources carry `argoplane.io/managed-by: portal`. Users can take ownership by removing the annotation. Portal never overwrites resources it didn't create. This enables a smooth, resource-by-resource transition from portal-managed to fully GitOps-native.
