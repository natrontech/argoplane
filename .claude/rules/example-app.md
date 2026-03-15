# Example App Maintenance

## Rule

When adding a new extension or new features to an existing extension, always:

1. Update `examples/demo-app/` so the demo app exercises the new functionality
2. Add RBAC for the new extension in `hack/configure-argocd.sh` (`extensions, invoke, <name>`)
3. Ensure the extension's UI bundle is included in `make deploy-extensions` (it loops over `EXTENSIONS` in the Makefile)
4. Add the extension name to the `EXTENSIONS` list in the Makefile if it's new

## How Extensions Get Loaded

Three things must happen for an extension to work in the dev environment:

1. **Backend deployed**: `make deploy-extensions` applies `deploy/extensions/<name>/deployment.yaml`
2. **UI bundle loaded**: `make deploy-extensions` copies `extensions/<name>/ui/dist/extension-<name>.js` into the argocd-server pod at `/tmp/extensions/`
3. **RBAC granted**: `hack/configure-argocd.sh` adds `p, role:admin, extensions, invoke, <name>, allow` to `argocd-rbac-cm`
4. **Proxy configured**: `deploy/argocd/proxy-extensions.json` routes `/extensions/<name>/*` to the backend service

## Current Coverage

The demo app uses the public `argocd-example-apps/guestbook` repo as the ArgoCD Application source, then layers on extra resources (CiliumNetworkPolicies, Velero schedule) via kubectl.

| Extension | Registration Type | Triggered By | Demo Resource |
|-----------|------------------|--------------|---------------|
| **Metrics** | Resource tab (Deployment, StatefulSet) | `apps/Deployment`, `apps/StatefulSet` | `guestbook-ui` Deployment |
| **Backups** | Status panel (any app) | Any ArgoCD Application | `argoplane-demo` Application + Velero Schedule |
| **Networking** | Resource tab (Deployment, StatefulSet, DaemonSet) | `apps/Deployment`, `apps/StatefulSet`, `apps/DaemonSet` | `guestbook-ui` Deployment + CiliumNetworkPolicy |

## When Adding a New Extension

1. Check what Kubernetes resource types the extension registers for (in `index.tsx`)
2. Add the necessary resources to `examples/demo-app/` if not already present
3. Add RBAC in `hack/configure-argocd.sh`
4. Add proxy config in `deploy/argocd/proxy-extensions.json`
5. Add the extension to `EXTENSIONS` in the Makefile
6. Update this table
7. Test with `make deploy-example` and verify the extension appears in the ArgoCD UI

## Adding New Resource Types

If a future extension needs a DaemonSet, Job, CronJob, Ingress, PVC, ConfigMap, or other resource type, add it to `examples/demo-app/` with realistic configuration that generates meaningful data for the extension.
