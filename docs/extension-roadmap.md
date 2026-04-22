# Extension Roadmap

All ArgoPlane extensions are named by **domain**, not by the underlying tool. Extensions focus on **Observe** (workload visibility) and **Secure** (security and compliance) categories.

## Strategy

ArgoPlane is a collection of ArgoCD UI extensions. Each extension attaches operational data to resources and applications inside ArgoCD: resource tabs, app views, status panels, and occasionally a system-level sidebar page for cross-cutting dashboards. Every extension works standalone and has no knowledge of the others.

### ArgoCD Extension Points

ArgoCD v3.x provides six registration methods. ArgoPlane uses most of them:

| Method | Where it appears | Used by |
|--------|-----------------|---------|
| `registerResourceExtension` | Tab on a K8s resource's sliding panel | Metrics, Backups, Networking, Logs, Vulnerabilities, Events |
| `registerAppViewExtension` | Full-page view in app details | Metrics, Backups, Networking, Logs, Vulnerabilities, Events |
| `registerStatusPanelExtension` | Compact widget in app header status bar | Metrics, Backups, Networking |
| `registerSystemLevelExtension` | Sidebar page (global, not tied to any app) | ArgoPlane Overview (planned) |
| `registerTopBarActionMenuExt` | Action button in top toolbar | (reserved for future use) |
| Application tab (`registerResourceExtension` with `argoproj.io/Application`) | Tab on Application resource | (reserved for future use) |

## Done

| Category | Domain | Description | Backend | Extension Points |
|----------|--------|-------------|---------|-----------------|
| Observe | **metrics** | CPU, memory, request rates, latency, custom PromQL queries | Prometheus | Resource tabs (Deployment, StatefulSet, Pod) + App view + Status panel |
| Observe | **backups** | Backup status, schedules, restore triggers, BSL details, pod volume backups | Velero | App view + Status panel + Resource tabs (Schedule, Backup) |
| Observe | **networking** | Traffic flows (Hubble), network policies, app vs platform ownership | Cilium/Hubble | App view + Status panel + Resource tabs (Pod, CiliumNetworkPolicy, CiliumClusterwideNetworkPolicy) |
| Observe | **logs** | Historical log search, label-based filtering, severity detection, time range selection, volume charts. No live tail (ArgoCD's built-in Logs tab handles real-time pod streaming; Loki's tail API uses WebSocket which the proxy extension mechanism does not support). | Loki | Resource tabs (Pod, Deployment, StatefulSet) + App view |
| Secure | **vulnerabilities** | Image vulnerability scanning (CVEs), config audit, exposed secrets detection, SBOM inventory. Per-image severity breakdown, CSV export, deduplication across ReplicaSets. | Trivy Operator (K8s API) | App view (4 tabs: Vulnerabilities, Config Audit, Exposed Secrets, SBOM) |
| Observe | **events** | Kubernetes events per resource and application. Warning/Normal event filtering, timeline view. | Kubernetes API | Resource tabs + App view |

## Next

| Category | Domain | Description | Backend | Extension Points |
|----------|--------|-------------|---------|-----------------|
| Secure | **policies** | Policy violations, admission control results, policy reports per app | Kyverno | Resource tabs + App view + Status panel |
| Observe | **alerts** | Firing/pending alerts, PrometheusRules and AlertmanagerConfigs per app, app vs platform ownership, smart links to Grafana/runbooks/Git | Prometheus Rules API, Alertmanager API | App view + Status panel |

## System-Level Extensions (Planned)

| Feature | Extension Point | Description |
|---------|----------------|-------------|
| **ArgoPlane Overview** | `registerSystemLevelExtension` | Sidebar page with aggregated health: all apps' sync status, top alerts, recent failed backups, cluster CPU/memory. Platform engineer's dashboard inside ArgoCD. |
| **Alerts Dashboard** | `registerSystemLevelExtension` | All firing/pending alerts across all apps. Filter by team, namespace, severity. Global view of what's wrong. |

## Future

| Category | Domain | Description | Backend |
|----------|--------|-------------|---------|
| Observe | **traces** | Distributed traces, spans, latency breakdown, trace-to-log correlation | Tempo, Jaeger |
| Secure | **certificates** | TLS certificate expiry warnings, renewal status, issuer details | cert-manager |
| Observe | **scaling** | HPA/VPA status, scaling events, recommendations, KEDA triggers | Kubernetes HPA, KEDA, VPA |

## Not Planned

| Domain | Reason |
|--------|--------|
| **notifications** | ArgoCD already has argocd-notifications |
| **identity** | ArgoCD native RBAC is sufficient |
| **gitops** | ArgoCD itself handles this |
| **catalog / self-service / tenant management** | Out of scope. ArgoPlane is an extension package, not a developer portal. |

## Maybe Later

| Category | Domain | Description | Notes |
|----------|--------|-------------|-------|
| Observe | **databases** | DB health, connections, backups, scaling | CNPG, Percona, Redis Operator |
| Observe | **costs** | Resource cost attribution per app/namespace | Kubecost, OpenCost |
| Secure | **secrets** | Secret sync status, rotation, store health | External Secrets, Vault; ESO already has visibility tools |
| Observe | **builds** | Build status, image tags, pipeline runs | GitHub Actions, GitLab CI, Tekton |

## Design Principles

**Domain-specific APIs.** Each extension backend abstracts the underlying tool behind a domain-specific API. Swapping Prometheus for OTel or Loki for Elasticsearch should only require changing the backend implementation, not the UI or API contract.

**Contextual relevance.** Surface information where it matters. A Pod tab should show that pod's logs and alerts, not a generic search page. App views provide the broader picture.

**App vs platform ownership.** Where applicable (alerts, policies, networking), distinguish between resources the app team deployed and platform-level resources that affect them. This pattern is established in the networking extension and should be reused.

**Smart links.** Connect the dots between systems. An alert should link to its Grafana dashboard, runbook, and source YAML. A policy violation should link to the policy definition. Logs should link to the trace ID.
