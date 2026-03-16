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

The portal serves three personas:

**Platform engineers**: team onboarding, RBAC management, AppProject templates, cluster inventory, service catalog publishing.

**Team leads / DevOps**: self-service team setup, GitOps repo connection, team dashboards, environment promotion.

**Developers**: service catalog browsing, simple app deployment (form to Git to ArgoCD), Crossplane resource claims, progressive GitOps.

### Portal Architecture

Single Go binary serves both the REST API and SvelteKit static files:

```
Browser → Go backend (:8080)
            ├── /api/v1/*    → REST handlers (K8s, ArgoCD, OIDC)
            └── /*           → SvelteKit static files (adapter-static)
```

- **Auth**: OIDC via ArgoCD's Dex instance. Same users, same groups. Go backend handles auth code flow, sets session cookie.
- **K8s access**: `client-go` for Crossplane XRDs, StorageClasses, CRDs, namespaces. In-cluster or kubeconfig.
- **ArgoCD access**: ArgoCD REST API for Applications, Projects, RBAC. Service account or user token forwarding.
- **Git access**: portal commits generated manifests to Git repos (portal-managed or team-owned). ArgoCD syncs from Git.

### Progressive GitOps

The portal's core model. Developers start simple and grow into GitOps:

**Level 0 (Portal-managed)**: developer fills a form. Portal generates manifests, commits to a portal-managed Git repo. ArgoCD syncs. Developer doesn't touch YAML or Git.

**Level 1 (Repo-aware)**: team connects their own repo. Portal scaffolds the structure. ArgoCD Application points at their repo. They start editing YAML.

**Level 2 (GitOps native)**: team owns everything in Git. Portal is read-only. ArgoCD is their interface.

### Git as the Control Plane

The portal never directly creates application-level K8s resources. The flow is always:

```
User action → Portal generates YAML → Git commit → ArgoCD sync → Kubernetes
```

Exceptions (direct K8s writes): team onboarding resources (namespace, AppProject, RBAC) that ArgoCD doesn't manage. Even these can optionally go through a platform team's GitOps repo.

### Platform Team Coexistence

The portal does not disturb platform team workflows:
- Platform teams keep managing operators, XRDs, and cluster-level resources their way
- The portal reads what's available (StorageClasses, CRDs, XRDs) but doesn't write to the platform layer
- RBAC and AppProject management is opt-in: use the portal UI or keep using Git
- The service catalog is a read layer over Crossplane XRDs: platform teams publish XRDs, the portal renders them as forms

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

ArgoPlane relies on ArgoCD's built-in RBAC and AppProjects for multi-tenancy. The portal adds a visual RBAC editor on top but doesn't replace the underlying model.

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
