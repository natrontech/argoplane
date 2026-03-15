# Extension Roadmap

All ArgoPlane extensions are named by **domain**, not by the underlying tool. Extensions fall into three categories: **Discover** (platform capabilities), **Observe** (workload visibility), and **Secure** (security and compliance).

## Phase 1 (Current)

| Category | Domain | Description | Initial backend |
|----------|--------|-------------|-----------------|
| Observe | **metrics** | CPU, memory, request rates, latency, custom metrics | Prometheus |
| Observe | **backups** | Backup status, schedules, restore triggers | Velero |

## Phase 2 (Next)

| Category | Domain | Description | Possible backends |
|----------|--------|-------------|-------------------|
| Discover | **platform** | StorageClasses, IngressClasses, GatewayClasses, node pools, CRDs, operators | Kubernetes API |
| Observe | **logs** | Application/container logs, structured log search | Loki, Elasticsearch, CloudWatch |
| Secure | **security** | Image vulnerabilities, runtime threats, compliance | Trivy, Grype, Falco, Snyk |
| Secure | **policies** | Policy violations, admission control results, security policies | Kyverno, OPA/Gatekeeper |

## Phase 3 (Future)

| Category | Domain | Description | Possible backends |
|----------|--------|-------------|-------------------|
| Discover | **services** | Self-service catalog: available platform resources, Crossplane claims | Crossplane, Kratix |
| Discover | **networking** | Traffic flows, network policies, service mesh topology | Cilium/Hubble, Calico, Istio, Linkerd |
| Observe | **traces** | Distributed traces, spans, latency breakdown | Jaeger, Tempo, Zipkin, OTel |
| Observe | **scaling** | HPA/VPA status, scaling events, recommendations | K8s HPA, KEDA, VPA, Goldilocks |
| Observe | **databases** | DB health, connections, backups, scaling | CNPG, Percona, Redis Operator |
| Observe | **costs** | Resource cost attribution per app/namespace | Kubecost, OpenCost |
| Secure | **secrets** | Secret sync status, rotation, store health | External Secrets, Vault, Sealed Secrets |
| Secure | **certificates** | TLS cert status, expiry, renewal | cert-manager |
| Observe | **builds** | Build status, image tags, pipeline runs | BuildKit, GitHub Actions, GitLab CI, Tekton |

### The Platform Extension

The **platform** extension is the centerpiece of the Discover category. It's a system-level page (sidebar navigation) that answers the question: *"What does this cluster offer me?"*

What it surfaces:
- **Storage**: available StorageClasses, default class, provisioner details, volume binding modes
- **Networking**: IngressClasses, GatewayClasses, default class, controller info
- **Compute**: node pools, labels, taints, allocatable resources, topology zones
- **CRDs and Operators**: installed CustomResourceDefinitions grouped by API group, which operators manage them
- **Gateway API**: available GatewayClasses, supported features, route types
- **Scheduling**: priority classes, resource quotas, limit ranges per namespace

It reads the Kubernetes API directly. No additional operator required.

Resource-level tabs can also use this data contextually. For example, a Deployment tab could show: "This PVC uses `gp3`. Other available StorageClasses: `gp3-encrypted`, `io2-high-iops`."

## Not Planned

| Domain | Reason |
|--------|--------|
| **notifications** | ArgoCD already has argocd-notifications |
| **identity** | ArgoCD native RBAC is sufficient |
| **gitops** | ArgoCD itself handles this |

## Design Principles

**Domain-specific APIs.** Each extension backend abstracts the underlying tool behind a domain-specific API. Swapping Prometheus for OTel or Velero for Kasten should only require changing the backend implementation, not the UI or API contract.

**Discoverability first.** Extensions should not only show the status of existing resources, but also expose what the platform offers. "Here's your app status" and "here's what your platform can do for you."

**Contextual relevance.** Surface platform capabilities where they matter. A Deployment tab should show relevant StorageClasses, not a generic catalog. System-level pages provide the full browse experience.
