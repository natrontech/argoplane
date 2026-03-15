# Architecture & Design Principles

## Extensions First

ArgoPlane is a collection of ArgoCD UI extensions, not a standalone application. Every feature ships as an extension that lives inside ArgoCD's UI. Don't build a separate portal unless there's a compelling reason ArgoCD's extension system can't handle it.

## Discoverability First

The core value of ArgoPlane is making platform capabilities visible to developers. Extensions should not only show the status of existing resources, but also expose what the platform offers. Every extension should answer two questions:

1. **"What's happening?"** (status of deployed resources)
2. **"What's available?"** (platform capabilities the developer could use)

For example, a storage extension doesn't just show PVC status. It also shows which StorageClasses are available and what they offer. A networking extension doesn't just show policies. It also shows which IngressClasses and GatewayClasses the developer can target.

Extensions fall into three categories:
- **Discover**: platform capabilities (Kubernetes API resources like StorageClasses, CRDs, operators, node pools)
- **Observe**: workload visibility (metrics, logs, traces, backups)
- **Secure**: security and compliance (vulnerabilities, policies, secrets, certificates)

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

## Crossplane for Abstractions

When platform teams want to offer self-service resources (databases, caches, storage), use Crossplane XRDs and compositions. ArgoPlane extensions surface these in the UI. Don't build custom operators when Crossplane can compose existing ones.

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
