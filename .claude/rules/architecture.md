# Architecture & Design Principles

## Two-Layer Architecture

ArgoPlane has two loosely coupled layers:

1. **ArgoCD extensions**: operational tools that attach to resources and applications inside ArgoCD's UI. They answer: **"What's happening with my app?"** They focus on Observe (metrics, logs, backups, alerts, networking, traces) and Secure (policies, certificates).
2. **ArgoPlane Portal**: a standalone SvelteKit + Go application that adds platform discoverability, self-service, team management, and ArgoCD administration. It answers: **"What does my platform offer, and how do I use it?"** It consumes ArgoCD's APIs and extension backends but is not required. Extensions work standalone.

## Extensions: Operational Visibility

Extensions show metrics, logs, alerts, backup status, network flows, policy violations, and other operational data in context.

Extensions fall into two categories:
- **Observe**: workload visibility (metrics, logs, traces, backups, alerts, networking, scaling)
- **Secure**: security and compliance (policies, certificates)

### Extension Points

ArgoCD v3.x provides six registration methods. Use the right one for each feature:

- **Resource tabs** (`registerResourceExtension`): per-resource operational data (metrics for a Deployment, flows for a Pod)
- **App views** (`registerAppViewExtension`): per-app operational views (all backups for this app, all network flows)
- **Status panels** (`registerStatusPanelExtension`): health at a glance in the app header
- **System-level pages** (`registerSystemLevelExtension`): cross-app dashboards in ArgoCD's sidebar (aggregated alerts, cluster health overview)
- **Top bar actions** (`registerTopBarActionMenuExt`): global action buttons (portal link)
- **Application tabs** (`registerResourceExtension` with `argoproj.io/Application`): tabs on the Application resource itself

### When to use system-level extensions

System-level extensions are sidebar pages, not tied to any specific app. Good for:
- Aggregated views (all alerts across all apps, cluster-wide backup status)
- Platform engineer dashboards (cluster health, resource usage)
- Cross-cutting concerns (global network policy matrix)
- Bridge to the portal (ArgoPlane Overview page with portal link)

Not good for: service catalogs, multi-step forms, team management, RBAC editing. Those belong in the portal.

## Portal: Self-Service and Platform Management

The portal builds on the **tenant chart pattern**: a Helm chart that defines everything a tenant gets, discovered by an ApplicationSet. The portal is a UI over this pattern.

### The Tenant Chart Pattern

The platform team maintains a tenant Helm chart that creates **guardrails**: namespaces (with Pod Security Standards), AppProjects (with resource whitelists and RBAC roles), a root ArgoCD Application pointing at the tenant's own GitOps repo, baseline network policies (Cilium), resource quotas, Kyverno policy bindings, and AlertmanagerConfig. An ApplicationSet with a git file generator discovers tenants by scanning for `values.yaml` files in the onboarding repo.

The tenant chart does NOT create apps or platform resources. Those live in the tenant's own GitOps repo.

**Onboarding a tenant = creating a directory with a values.yaml in the onboarding repo and committing.**

### Two-Repo Model

- **Tenant onboarding repo** (platform-managed, shared): contains `tenants/<cluster>/<name>/values.yaml` for each tenant. An ApplicationSet discovers these. The tenant Helm chart renders guardrails from the values. Portal commits here for onboarding and config changes.
- **Tenant GitOps repo** (per-tenant, tenant-owned): contains `apps/` (ArgoCD Application manifests referencing a common Helm chart) and `resources/` (Crossplane XRD claims). The tenant chart creates a root ArgoCD Application pointing at this repo. Portal commits here for app deploys and resource requests.

### App Deployment Model

Apps are deployed via a **common Helm chart** maintained by the platform team and published to an OCI registry. The tenant's GitOps repo contains ArgoCD Application manifests that reference the common chart with app-specific values (image, port, replicas, ingress). The platform team curates chart templates (web-app, worker, cron-job) in a ConfigMap.

Portal generates these Application manifests for Level 0 developers. Power users edit them directly in Git. At Level 2, teams may switch to their own charts entirely.

### Service Catalog

Two discovery mechanisms, one unified UI:

- **Helm chart templates** (for apps): curated by platform team in a ConfigMap. Includes chart name, repo URL, version, description, and default values. Portal renders forms from the chart's values schema.
- **Crossplane XRDs** (for platform resources): auto-discovered from K8s API, filtered by `argoplane.io/catalog: "true"` label and cross-referenced with the tenant's AppProject resource whitelist. Portal renders forms from the XRD's OpenAPI schema.

### Annotation-Based Management

Portal-generated resources carry `argoplane.io/managed-by: portal` annotation. Portal only modifies resources it created. Users take ownership by editing resources directly or removing the annotation. Progressive GitOps levels emerge naturally: Level 0 (all portal-annotated), Level 1 (mixed), Level 2 (no annotations, portal read-only).

### Ownership Model

**Platform team** (owns the structure):
- Defines the tenant Helm chart (guardrails: namespace, AppProject, policies, quotas)
- Maintains the common app Helm chart and publishes to OCI registry
- Curates the catalog ConfigMap with approved chart templates
- Defines Crossplane XRDs and Compositions (platform resources)
- Configures ArgoCD repocreds for GitOps repo access
- Manages base-values.yaml per cluster
- Maintains the ApplicationSet configuration

**Team leads** (self-service within guardrails):
- Manage team membership: assign OIDC groups to roles within their tenant
- View tenant status: apps, sync status, resources
- Scoped to their own tenant only

**Developers** (consume platform services):
- Browse the service catalog (Helm chart templates for apps, XRDs for platform resources)
- Deploy apps via forms (portal generates ArgoCD Application manifest, commits to tenant GitOps repo)
- Request platform resources via catalog forms (portal generates XRD claim, commits to tenant GitOps repo)

### Portal Architecture

Single Go binary serves both the REST API and SvelteKit static files:

```
Browser → Go backend (:8080)
            ├── /api/v1/*    → REST handlers (K8s, ArgoCD, OIDC, Git)
            └── /*           → SvelteKit static files (adapter-static)
```

- **Auth**: OIDC via ArgoCD's Dex instance. Same users, same groups. Go backend handles auth code flow, sets session cookie.
- **K8s access**: `client-go` for reading Crossplane XRDs (catalog), AppProject resource whitelists, and tenant status.
- **ArgoCD access**: ArgoCD REST API for Applications, Projects, sync status.
- **Git access**: portal commits to two repos. Onboarding repo for tenant lifecycle (values.yaml). Tenant GitOps repo for apps (Application manifests) and resources (XRD claims).

### Progressive GitOps

The portal's core model. Levels are emergent, not configured:

**Level 0 (Portal-managed)**: portal creates a GitOps repo for the tenant. Developer fills forms. Portal generates Application manifests and XRD claims with `argoplane.io/managed-by: portal` annotations, commits to the repo. Developer doesn't touch YAML or Git.

**Level 1 (Mixed)**: team starts editing manifests in their GitOps repo alongside portal-generated ones. Portal manages its annotated resources, shows everything else read-only.

**Level 2 (GitOps native)**: team owns the repo completely. Portal is read-only: dashboards, service discovery, status. ArgoCD is their interface.

### Git as the Control Plane

The portal never directly creates K8s resources. Two flows:

```
Tenant onboarding: portal → values.yaml → onboarding repo → ApplicationSet → tenant chart → guardrails
App/resource deploy: portal → Application manifest or XRD claim → tenant GitOps repo → root Application → ArgoCD/Crossplane
```

No exceptions. Everything goes through Git. ArgoCD reconciles.

### Platform Team Coexistence

The portal does not disturb platform team workflows:
- Platform teams own the tenant Helm chart and evolve it at their own pace
- The common app Helm chart is owned by the platform team. Portal reads chart values schemas to render forms but never modifies the chart.
- Platform teams keep managing operators, XRDs, and cluster-level resources their way
- The service catalog combines Helm chart templates (from a ConfigMap) and Crossplane XRDs (auto-discovered). Platform team controls what's available.
- Role definitions live in the chart templates. The portal only manages group-to-role assignments.

## Extension Architecture

Every ArgoPlane extension has three parts:

1. **UI extension** (React/TypeScript): registers tabs, status panels, pages, or sidebar entries via `window.extensionsAPI`
2. **Backend service** (Go): queries the underlying system (Prometheus, Velero, etc.) and exposes an HTTP API
3. **Proxy extension config**: ArgoCD routes `/extensions/<name>/*` to the backend service

This is the same pattern used by `argocd-extension-metrics` and other official extensions.

## Simplicity First

Prefer simplicity over abstraction. Simple code is easier to read, debug, and operate. Three similar lines of code are better than a premature abstraction. Don't build frameworks. Build features.

If a design feels complicated, step back and ask: is there a simpler way? Usually there is.

## Stateless

No central database. All state is derived from external systems:

- **Kubernetes API**: platform capabilities (StorageClasses, IngressClasses, CRDs, nodes, policies), ArgoCD Applications, operator resources, namespaces, labels
- **ArgoCD API**: Applications, Projects, RBAC policies, sync status
- **Prometheus**: metrics data
- **Velero**: backup/restore status
- **Git**: GitOps repos, Helm values, portal-managed manifests
- **Dex (OIDC)**: users, roles, groups, authentication

If you're tempted to add a database, reconsider. The right answer is almost always to query an existing system.

## Authentication

**Extensions**: inherit ArgoCD's authentication. The API server validates the user's token and passes identity headers (`Argocd-Username`, `Argocd-User-Id`, `Argocd-User-Groups`) to the backend.

**Portal**: authenticates via OIDC against ArgoCD's Dex instance. Same users, same groups, one identity source. Register the portal as an additional `staticClient` in Dex's config. Go backend handles the auth code flow and session management.

## ArgoCD Native RBAC

ArgoPlane relies on ArgoCD's built-in RBAC and AppProjects for multi-tenancy. The tenant Helm chart defines role templates and resource whitelists. The portal manages group-to-role assignments within tenants but never modifies the role definitions themselves.

ArgoCD v3 changes to be aware of:
- Fine-grained RBAC: `update`/`delete` on applications no longer cascades to sub-resources. Grant explicit `update/*` and `delete/*` permissions if needed.
- Logs RBAC is always enforced. Users need explicit `logs, get` permission.
- Extensions require explicit RBAC: `p, role:developer, extensions, invoke, <name>, allow`
- Annotation-based resource tracking is the default (not label-based).
- Resource health is stored in Redis by default, not in `.status.resources[].health`.

## Don't Reinvent

If ArgoCD, Helm, Crossplane, or a Kubernetes operator already manages a piece of state, use it. Don't duplicate it. Don't wrap it in an unnecessary abstraction.

The portal doesn't replace ArgoCD. It doesn't replace Crossplane. It provides a developer-friendly layer that commits to Git and lets existing tools do the reconciliation.

## Idempotent Operations

Operations that touch Kubernetes state must be idempotent.

- **Create**: check if the resource exists first. If yes, return success.
- **Delete**: if already gone, return success.
- **Update**: verify current state before applying changes.

## Loose Coupling

Extensions are independent. The metrics extension doesn't need to know about the backups extension. Each extension owns its domain. They share nothing except the ArgoCD proxy mechanism.

The portal consumes extension backends and the ArgoCD API but extensions never depend on the portal. If the portal is down, extensions keep working inside ArgoCD.

## Minimal Day-2 Operations

Features should be operable by a small team. Ask:

- Does this add ongoing maintenance burden?
- Can it self-heal or does it need manual intervention?
- What happens when it breaks. Does the blast radius stay small?
- Is observability built in, not bolted on?
