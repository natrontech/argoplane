# Example App Maintenance

## Rule

When adding a new extension or new features to an existing extension, always:

1. Update `examples/demo-app/` so the demo app exercises the new functionality
2. Add RBAC for the new extension in `hack/setup-argocd.sh` (`extensions, invoke, <name>`)
3. Ensure the extension's UI bundle is included in `make setup-argocd` (it loops over `EXTENSIONS`)
4. Add the extension name to the `EXTENSIONS` list in the Makefile if it's new

## How Extensions Get Loaded

Three things must happen for an extension to work in the dev environment:

1. **Backend deployed**: `hack/setup-argocd.sh` applies `deploy/extensions/<name>/deployment.yaml`
2. **UI bundle loaded**: `hack/setup-argocd.sh` copies `extensions/<name>/ui/dist/extension-<name>.js` into the argocd-server pod at `/tmp/extensions/`
3. **RBAC granted**: `hack/setup-argocd.sh` adds `p, role:admin, extensions, invoke, <name>, allow` to `argocd-rbac-cm`
4. **Proxy configured**: `deploy/argocd/proxy-extensions.json` routes `/extensions/<name>/*` to the backend service

## Current Coverage

The demo app uses the public `argocd-example-apps/guestbook` repo as the ArgoCD Application source, then layers on extra resources (CiliumNetworkPolicies, Velero schedule) via kubectl.

| Extension | Registration Type | Triggered By | Demo Resource |
|-----------|------------------|--------------|---------------|
| **Metrics** | Resource tab (Deployment, StatefulSet, Pod) + System-level page | `apps/Deployment`, `apps/StatefulSet`, `/Pod` + sidebar | `guestbook-ui` Deployment |
| **Backups** | App view (application detail) + Status panel + Schedule resource tab + Backup resource tab | Any ArgoCD Application + `velero.io/Schedule` + `velero.io/Backup` | `argoplane-demo` Application + 1 app Schedule (`argoplane-demo-daily` in velero ns, RespectNamespace=true) + 2 platform Schedules (`platform-nightly-all`, `platform-weekly-compliance`) + BSL details + trigger backup from schedule + granular restore + logs/results download |
| **Networking** | App view (application detail) + Pod resource tab | Any ArgoCD Application + `/Pod` | `guestbook-ui` Deployment + 2 app CiliumNetworkPolicies + 2 platform CiliumClusterwideNetworkPolicies + 2 platform CiliumNetworkPolicies + cross-ns traffic + Hubble flows |
| **Logs** | Resource tab (Pod, Deployment, StatefulSet) + App view (Log Explorer) | `apps/Deployment`, `apps/StatefulSet`, `/Pod` + Any ArgoCD Application | `guestbook-ui` Deployment pods (requires Loki + Alloy collecting logs) |
| **Vulnerabilities** | App view (4 tabs: Vulnerabilities, Config Audit, Exposed Secrets, SBOM) | Any ArgoCD Application | `guestbook-ui` Deployment images (requires Trivy Operator scanning workloads) |

## When Adding a New Extension

1. Check what Kubernetes resource types the extension registers for (in `index.tsx`)
2. Add the necessary resources to `examples/demo-app/` if not already present
3. Add RBAC in `hack/setup-argocd.sh`
4. Add proxy config in `deploy/argocd/proxy-extensions.json`
5. Add the extension to `EXTENSIONS` in the Makefile
6. Update this table
7. Test with `make deploy-example` and verify the extension appears in the ArgoCD UI

## Adding New Resource Types

If a future extension needs a DaemonSet, Job, CronJob, Ingress, PVC, ConfigMap, or other resource type, add it to `examples/demo-app/` with realistic configuration that generates meaningful data for the extension.
