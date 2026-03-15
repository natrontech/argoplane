# Architecture & Design Principles

## Two-Layer Architecture

ArgoPlane has two loosely coupled layers:

1. **ArgoCD extensions**: operational tools that attach to resources and applications inside ArgoCD's UI. These are the core product today. They focus on Observe (metrics, logs, backups, alerts, networking, traces) and Secure (policies, certificates).
2. **ArgoPlane Portal** (future): a separate SvelteKit application that adds platform discoverability, self-service, and aggregated views on top of ArgoCD. It consumes ArgoCD's APIs and extension backends but is not required. Extensions work standalone.

## Extensions: Operational Visibility

Extensions answer the question: **"What's happening with my app?"** They show metrics, logs, alerts, backup status, network flows, policy violations, and other operational data in context.

Extensions fall into two categories:
- **Observe**: workload visibility (metrics, logs, traces, backups, alerts, networking, scaling)
- **Secure**: security and compliance (policies, certificates)

## Portal: Discoverability and Self-Service (Future)

The portal answers: **"What does my platform offer, and how do I use it?"** This includes StorageClasses, IngressClasses, CRDs, operators, node pools, Crossplane XRDs, and guided self-service workflows. ArgoCD's extension system is too restrictive for catalog-style browsing and form-based workflows, so the portal handles those.

The portal leverages ArgoCD (Applications, RBAC, sync status) and extension backends (metrics, alerts) but never replaces them. Power users can stay in ArgoCD with extensions alone.

## Extension Architecture

Every ArgoPlane extension has three parts:

1. **UI extension** (React/TypeScript): registers tabs, status panels, or pages via `window.extensionsAPI`
2. **Backend service** (Go): queries the underlying system (Prometheus, Velero, etc.) and exposes an HTTP API
3. **Proxy extension config**: ArgoCD routes `/extensions/<name>/*` to the backend service

This is the same pattern used by `argocd-extension-metrics` and other official extensions.

## Simplicity First

Prefer simplicity over abstraction. Simple code is easier to read, debug, and operate. Three similar lines of code are better than a premature abstraction. Don't build frameworks. Build features.

If a design feels complicated, step back and ask: is there a simpler way? Usually there is.

## Stateless

No central database. All state is derived from external systems:

- **Kubernetes API**: platform capabilities (StorageClasses, IngressClasses, CRDs, nodes, policies), ArgoCD Applications, operator resources, namespaces, labels
- **Prometheus**: metrics data
- **Velero**: backup/restore status
- **Git**: GitOps repos, Helm values
- **Identity Provider (OIDC)**: users, roles, authentication (via ArgoCD)

If you're tempted to add a database, reconsider. The right answer is almost always to query an existing system.

## ArgoCD Native RBAC

ArgoPlane relies on ArgoCD's built-in RBAC and AppProjects for multi-tenancy and access control. Don't build a custom auth layer. Proxy extensions inherit ArgoCD's authentication: the API server validates the user's token and passes identity headers to the backend.

ArgoCD v3 changes to be aware of:
- Fine-grained RBAC: `update`/`delete` on applications no longer cascades to sub-resources. Grant explicit `update/*` and `delete/*` permissions if needed.
- Logs RBAC is always enforced. Users need explicit `logs, get` permission.
- Extensions require explicit RBAC: `p, role:developer, extensions, invoke, <name>, allow`
- Annotation-based resource tracking is the default (not label-based).
- Resource health is stored in Redis by default, not in `.status.resources[].health`.

## Don't Reinvent

If ArgoCD, Helm, Crossplane, or a Kubernetes operator already manages a piece of state, use it. Don't duplicate it. Don't wrap it in an unnecessary abstraction.

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
