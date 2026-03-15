# Extension Roadmap

All ArgoPlane extensions are named by **domain**, not by the underlying tool. Extensions focus on **Observe** (workload visibility) and **Secure** (security and compliance) categories. Platform discoverability and self-service features will live in the ArgoPlane Portal (Phase 4).

## Strategy

ArgoCD extensions handle what they do well: attaching operational views to resources and applications. The extension system is powerful for contextual, resource-level visibility but limited for cross-cutting concerns like platform catalogs, self-service, and developer onboarding.

ArgoPlane's approach:

1. **Extensions**: best-in-class operational tools inside ArgoCD (metrics, logs, backups, alerts, networking, policies, traces). These work standalone for power users.
2. **Portal** (future): a separate developer portal layer built on SvelteKit that handles discoverability, self-service, and aggregated views. It consumes ArgoCD APIs and extension backends. Loosely coupled: extensions never depend on the portal.

## Phase 1 (Done)

| Category | Domain | Description | Backend |
|----------|--------|-------------|---------|
| Observe | **metrics** | CPU, memory, request rates, latency, custom PromQL queries | Prometheus |
| Observe | **backups** | Backup status, schedules, restore triggers, BSL details, pod volume backups | Velero |
| Observe | **networking** | Traffic flows (Hubble), network policies, app vs platform ownership | Cilium/Hubble |

## Phase 2 (Next)

| Category | Domain | Description | Backend |
|----------|--------|-------------|---------|
| Observe | **logs** | Log search, label-based filtering, LogQL queries, live tail, log volume, severity detection | Loki |
| Secure | **policies** | Policy violations, admission control results, policy reports per app | Kyverno |
| Observe | **alerts** | Firing/pending alerts, PrometheusRules and AlertmanagerConfigs per app, app vs platform ownership, smart links to Grafana/runbooks/Git | Prometheus Rules API, Alertmanager API |

## Phase 3 (Future)

| Category | Domain | Description | Backend |
|----------|--------|-------------|---------|
| Observe | **traces** | Distributed traces, spans, latency breakdown, trace-to-log correlation | Tempo, Jaeger |
| Secure | **certificates** | TLS certificate expiry warnings, renewal status, issuer details | cert-manager |
| Observe | **scaling** | HPA/VPA status, scaling events, recommendations, KEDA triggers | Kubernetes HPA, KEDA, VPA |

## Phase 4 (ArgoPlane Portal)

A separate developer portal built with SvelteKit that sits on top of ArgoCD. Planned separately, but the high-level scope:

- **Platform discoverability**: StorageClasses, IngressClasses, GatewayClasses, CRDs, operators, node pools, scheduling options
- **Self-service catalog**: Crossplane XRDs/compositions, request and manage platform resources
- **Aggregated views**: combine metrics, logs, alerts, backups in a single app dashboard
- **Developer onboarding**: guided flows for new teams and applications
- **Leverages ArgoCD**: uses ArgoCD's APIs, RBAC, and Application model as the foundation

Extensions continue to work standalone inside ArgoCD for power users. The portal adds a developer-friendly layer on top without replacing them.

## Not Planned (as extensions)

| Domain | Reason |
|--------|--------|
| **notifications** | ArgoCD already has argocd-notifications |
| **identity** | ArgoCD native RBAC is sufficient |
| **gitops** | ArgoCD itself handles this |
| **platform** | Moved to Portal (Phase 4); ArgoCD's extension system is too limited for catalog-style browsing |
| **services** | Moved to Portal (Phase 4); self-service requires forms, workflows, and state that extensions can't handle well |

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
