# Architecture & Design Principles

## What ArgoPlane Is

ArgoPlane is a collection of ArgoCD UI extensions. Each extension attaches operational data to resources and applications inside ArgoCD's UI. They answer: **"What's happening with my app?"** They cover Observe (metrics, logs, backups, alerts, networking, traces) and Secure (policies, certificates).

Extensions fall into two categories:
- **Observe**: workload visibility (metrics, logs, traces, backups, alerts, networking, scaling)
- **Secure**: security and compliance (policies, certificates)

## Extension Points

ArgoCD v3.x provides six registration methods. Use the right one for each feature:

- **Resource tabs** (`registerResourceExtension`): per-resource operational data (metrics for a Deployment, flows for a Pod)
- **App views** (`registerAppViewExtension`): per-app operational views (all backups for this app, all network flows)
- **Status panels** (`registerStatusPanelExtension`): health at a glance in the app header
- **System-level pages** (`registerSystemLevelExtension`): cross-app dashboards in ArgoCD's sidebar (aggregated alerts, cluster health overview)
- **Top bar actions** (`registerTopBarActionMenuExt`): global action buttons
- **Application tabs** (`registerResourceExtension` with `argoproj.io/Application`): tabs on the Application resource itself

### When to use system-level extensions

System-level extensions are sidebar pages, not tied to any specific app. Good for:
- Aggregated views (all alerts across all apps, cluster-wide backup status)
- Platform engineer dashboards (cluster health, resource usage)
- Cross-cutting concerns (global network policy matrix)

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

- **Kubernetes API**: ArgoCD Applications, operator resources, namespaces, CRDs, nodes, policies
- **ArgoCD API**: Applications, Projects, RBAC policies, sync status
- **Prometheus**: metrics data
- **Velero**: backup/restore status
- **Loki**: logs
- **Trivy Operator**: vulnerability scan results

If you're tempted to add a database, reconsider. The right answer is almost always to query an existing system.

## Authentication

Extensions inherit ArgoCD's authentication. The API server validates the user's token and passes identity headers (`Argocd-Username`, `Argocd-User-Id`, `Argocd-User-Groups`) to the backend.

## ArgoCD Native RBAC

ArgoPlane relies on ArgoCD's built-in RBAC and AppProjects for multi-tenancy.

ArgoCD v3 changes to be aware of:
- Fine-grained RBAC: `update`/`delete` on applications no longer cascades to sub-resources. Grant explicit `update/*` and `delete/*` permissions if needed.
- Logs RBAC is always enforced. Users need explicit `logs, get` permission.
- Extensions require explicit RBAC: `p, role:developer, extensions, invoke, <name>, allow`
- Annotation-based resource tracking is the default (not label-based).
- Resource health is stored in Redis by default, not in `.status.resources[].health`.

## Don't Reinvent

If ArgoCD, Helm, or a Kubernetes operator already manages a piece of state, use it. Don't duplicate it. Don't wrap it in an unnecessary abstraction.

## Idempotent Operations

Operations that touch Kubernetes state must be idempotent.

- **Create**: check if the resource exists first. If yes, return success.
- **Delete**: if already gone, return success.
- **Update**: verify current state before applying changes.

## Loose Coupling

Extensions are independent. The metrics extension doesn't need to know about the backups extension. Each extension owns its domain. They share nothing except the ArgoCD proxy mechanism.

## Minimal Day-2 Operations

Features should be operable by a small team. Ask:

- Does this add ongoing maintenance burden?
- Can it self-heal or does it need manual intervention?
- What happens when it breaks. Does the blast radius stay small?
- Is observability built in, not bolted on?
