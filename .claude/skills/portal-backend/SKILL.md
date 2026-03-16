---
name: portal-backend
description: Scaffold and develop the ArgoPlane Portal Go backend. Use when the user wants to build portal API endpoints, set up OIDC auth, add K8s/ArgoCD integration, or work on the portal's Go server. Trigger when the user mentions "portal backend", "portal API", "portal auth", "tenant onboarding", "service catalog API", "catalog API", "common Helm chart", or wants to build Go code for the portal.
user-invocable: true
argument-hint: "[feature-name]"
allowed-tools: Bash(mkdir *), Write, Read, Glob, Grep
---

# ArgoPlane Portal Backend

Scaffold or extend the ArgoPlane Portal Go backend for feature: **$ARGUMENTS**

## Architecture

The portal backend is a Go HTTP server at `services/portal/backend/` that:

1. Serves the SvelteKit static files (production)
2. Handles OIDC authentication via ArgoCD's Dex instance
3. Provides REST API endpoints for the portal frontend
4. Queries Kubernetes API via `client-go`
5. Queries ArgoCD REST API for Applications, Projects, RBAC
6. Commits to two Git repos: onboarding repo (tenant values.yaml) and tenant GitOps repo (app manifests, resource claims)

## Directory Structure

```
services/portal/backend/
  cmd/
    main.go                    # Entry point, config loading, server setup
  internal/
    server/
      server.go                # HTTP server, route registration, middleware
      middleware.go            # Auth middleware, logging, CORS
    auth/
      oidc.go                  # Dex OIDC provider, auth code flow
      session.go               # Session management (secure cookies)
      middleware.go            # Auth middleware (validate session, extract user)
    tenants/
      handler.go               # Tenant CRUD (via onboarding repo commits)
      values.go                # Generate/parse tenant values.yaml
      membership.go            # OIDC group → role assignment in values
      onboarding.go            # Tenant onboarding workflow
    catalog/
      charts.go                # Helm chart template discovery from ConfigMap
      xrd.go                   # Crossplane XRD discovery (argoplane.io/catalog label)
    apps/
      handler.go               # Application CRUD (via tenant GitOps repo commits)
      application.go           # ArgoCD Application manifest generation (common Helm chart)
    resources/
      handler.go               # Platform resource CRUD (via tenant GitOps repo commits)
      claim.go                 # Crossplane XRD claim manifest generation
    ops/
      alerts.go                # Aggregated alerts (Alertmanager API, tenant-scoped)
      backups.go               # Aggregated backups (Velero via K8s, tenant-scoped)
      activity.go              # Activity feed (Git history from both repos)
    events/
      sse.go                   # Server-Sent Events for real-time updates
    argocd/
      client.go                # ArgoCD REST API client
    gitops/
      onboarding_repo.go       # Onboarding repo operations (tenants/ values.yaml)
      tenant_repo.go           # Tenant GitOps repo operations (apps/, resources/)
      values.go                # YAML generation helpers
    k8s/
      client.go                # Kubernetes client-go setup
  go.mod
  go.sum
  Dockerfile
  .env.example
```

## Scaffolding a New Feature

When adding a new feature to the portal backend:

1. Create a package under `internal/<domain>/`
2. Define the handler struct with dependencies injected via constructor
3. Register routes in `internal/server/server.go`
4. Add configuration to `Config` struct in `cmd/main.go` if needed
5. Update `.env.example` with new env vars

## Configuration

```go
type Config struct {
    Port             string `envconfig:"PORT" default:"8080"`
    DexURL           string `envconfig:"DEX_URL" required:"true"`
    DexClientID      string `envconfig:"DEX_CLIENT_ID" default:"argoplane-portal"`
    DexClientSecret  string `envconfig:"DEX_CLIENT_SECRET" required:"true"`
    ArgocdURL        string `envconfig:"ARGOCD_URL" required:"true"`
    ArgocdAuthToken  string `envconfig:"ARGOCD_AUTH_TOKEN"`
    SessionSecret    string `envconfig:"SESSION_SECRET" required:"true"`
    OnboardingRepoURL    string `envconfig:"ONBOARDING_REPO_URL" required:"true"`
    OnboardingRepoBranch string `envconfig:"ONBOARDING_REPO_BRANCH" default:"main"`
    CatalogConfigMap     string `envconfig:"CATALOG_CONFIGMAP" default:"argoplane-catalog-charts"`
    ChartRegistryURL     string `envconfig:"CHART_REGISTRY_URL"`
    AlertmanagerURL  string `envconfig:"ALERTMANAGER_URL"`
    PrometheusURL    string `envconfig:"PROMETHEUS_URL"`
    LogLevel         string `envconfig:"LOG_LEVEL" default:"info"`
    StaticDir        string `envconfig:"STATIC_DIR" default:"./static"`
    KubeConfig       string `envconfig:"KUBECONFIG"`
}
```

## API Routes

```go
// Auth
mux.HandleFunc("GET /api/v1/auth/login", s.auth.HandleLogin)
mux.HandleFunc("GET /api/v1/auth/callback", s.auth.HandleCallback)
mux.HandleFunc("POST /api/v1/auth/logout", s.auth.HandleLogout)
mux.HandleFunc("GET /api/v1/auth/me", s.auth.HandleMe)

// Tenants (authenticated)
mux.HandleFunc("GET /api/v1/tenants", s.tenants.HandleList)
mux.HandleFunc("POST /api/v1/tenants", s.tenants.HandleCreate)
mux.HandleFunc("GET /api/v1/tenants/{cluster}/{name}", s.tenants.HandleGet)
mux.HandleFunc("PUT /api/v1/tenants/{cluster}/{name}", s.tenants.HandleUpdate)

// Tenant membership (OIDC group → role assignment)
mux.HandleFunc("GET /api/v1/tenants/{cluster}/{name}/membership", s.tenants.HandleMembership)
mux.HandleFunc("PUT /api/v1/tenants/{cluster}/{name}/membership", s.tenants.HandleUpdateMembership)

// Service catalog (authenticated)
mux.HandleFunc("GET /api/v1/catalog/charts", s.catalog.HandleCharts)    // Helm chart templates from ConfigMap
mux.HandleFunc("GET /api/v1/catalog/xrds", s.catalog.HandleXRDs)        // Crossplane XRDs with catalog label

// Applications (authenticated, tenant-scoped, writes to tenant GitOps repo)
mux.HandleFunc("GET /api/v1/apps", s.apps.HandleList)
mux.HandleFunc("POST /api/v1/apps", s.apps.HandleCreate)
mux.HandleFunc("GET /api/v1/apps/{namespace}/{name}", s.apps.HandleGet)
mux.HandleFunc("PUT /api/v1/apps/{namespace}/{name}", s.apps.HandleUpdate)
mux.HandleFunc("DELETE /api/v1/apps/{namespace}/{name}", s.apps.HandleDelete)

// Platform resources (authenticated, tenant-scoped, writes to tenant GitOps repo)
mux.HandleFunc("GET /api/v1/resources", s.resources.HandleList)
mux.HandleFunc("POST /api/v1/resources", s.resources.HandleCreate)
mux.HandleFunc("DELETE /api/v1/resources/{namespace}/{name}", s.resources.HandleDelete)

// Aggregated operations (authenticated, tenant-scoped)
mux.HandleFunc("GET /api/v1/tenants/{cluster}/{name}/alerts", s.ops.HandleAlerts)
mux.HandleFunc("POST /api/v1/tenants/{cluster}/{name}/alerts/{id}/silence", s.ops.HandleSilenceAlert)
mux.HandleFunc("GET /api/v1/tenants/{cluster}/{name}/backups", s.ops.HandleBackups)
mux.HandleFunc("POST /api/v1/tenants/{cluster}/{name}/backups/trigger", s.ops.HandleTriggerBackup)
mux.HandleFunc("GET /api/v1/tenants/{cluster}/{name}/activity", s.ops.HandleActivity)

// Real-time events (SSE, authenticated)
mux.HandleFunc("GET /api/v1/events", s.events.HandleSSE)

// Clusters (authenticated)
mux.HandleFunc("GET /api/v1/clusters", s.clusters.HandleList)

// Health (unauthenticated)
mux.HandleFunc("GET /api/v1/health", s.HandleHealth)
```

## Authentication Pattern

```go
// OIDC auth via Dex
type AuthHandler struct {
    provider    *oidc.Provider
    oauth2Conf  *oauth2.Config
    sessions    *SessionStore
    dexURL      string
}

func NewAuthHandler(dexURL, clientID, clientSecret, redirectURL, sessionSecret string) (*AuthHandler, error) {
    provider, err := oidc.NewProvider(context.Background(), dexURL)
    if err != nil {
        return nil, fmt.Errorf("failed to create OIDC provider: %w", err)
    }

    oauth2Conf := &oauth2.Config{
        ClientID:     clientID,
        ClientSecret: clientSecret,
        RedirectURL:  redirectURL,
        Endpoint:     provider.Endpoint(),
        Scopes:       []string{oidc.ScopeOpenID, "profile", "email", "groups"},
    }

    return &AuthHandler{
        provider:   provider,
        oauth2Conf: oauth2Conf,
        sessions:   NewSessionStore(sessionSecret),
        dexURL:     dexURL,
    }, nil
}
```

## Multi-Tenancy

OIDC groups from Dex map to tenants via the tenant values.yaml `adminGroupIds` field and ArgoCD AppProject role bindings:

```go
func (s *Server) authorizedTenants(ctx context.Context, groups []string) ([]Tenant, error) {
    // Read tenant configs from tenant GitOps repo
    // Match OIDC groups against adminGroupIds / contributorGroupIds
    // Return only tenants the user's groups have access to
}
```

All queries are scoped by the user's authorized tenants. Never return data from tenants the user doesn't belong to.

## Git Operations (Two Repos)

The portal commits to two Git repos:

```go
// Onboarding repo: tenant lifecycle (values.yaml)
type OnboardingRepo struct {
    repoURL  string
    branch   string
}

// Onboard a new tenant: create directory + values.yaml
func (r *OnboardingRepo) CreateTenant(ctx context.Context, cluster, name string, values TenantValues) error {
    // Create tenants/<cluster>/<name>/values.yaml via GitHub/GitLab API
    // ApplicationSet discovers the new directory, creates Application
    // ArgoCD renders tenant Helm chart with values (guardrails)
}

// Update tenant config (membership, quotas, allowed resources)
func (r *OnboardingRepo) UpdateTenant(ctx context.Context, cluster, name string, values TenantValues) error {
    // Update tenants/<cluster>/<name>/values.yaml via GitHub/GitLab API
    // ArgoCD detects drift, syncs
}

// Tenant GitOps repo: apps and platform resources
type TenantGitOpsRepo struct {
    repoURL  string
    branch   string
}

// Deploy an app: generate ArgoCD Application manifest referencing common Helm chart
func (r *TenantGitOpsRepo) CreateApp(ctx context.Context, namespace, name string, chartRef ChartRef, values map[string]any) error {
    // Generate ArgoCD Application manifest with common chart + values
    // Add argoplane.io/managed-by: portal annotation
    // Commit to apps/<name>.yaml in tenant GitOps repo
}

// Request a platform resource: generate Crossplane XRD claim
func (r *TenantGitOpsRepo) CreateResource(ctx context.Context, namespace, name string, xrd XRDRef, params map[string]any) error {
    // Generate Crossplane XRD claim manifest
    // Add argoplane.io/managed-by: portal annotation
    // Commit to resources/<name>/claim.yaml in tenant GitOps repo
}
```

Use GitHub/GitLab REST API for single-file operations (stateless). Use shallow clones for multi-file operations. Authenticate via GitHub App tokens or deploy keys (shared via ArgoCD repocreds).

## Service Catalog Discovery

The catalog combines two sources:

1. **Helm chart templates**: read from a ConfigMap (name from `CATALOG_CONFIGMAP` env var). Platform team curates entries with chart name, repo URL, version, description, and default values. Used for app deployment (web-app, worker, cron-job profiles).

2. **Crossplane XRDs**: auto-discovered from K8s API. Filtered by `argoplane.io/catalog: "true"` label. Cross-referenced with tenant's AppProject resource whitelist. Used for platform resources (databases, caches, registries).

## Aggregated Operations

The portal provides tenant-scoped aggregated views over data that extensions show per-resource:

```go
// Alerts: query Alertmanager API, filter by tenant namespaces
type OpsHandler struct {
    alertmanagerURL string
    prometheusURL   string
    argocd          *ArgocdClient
    k8s             *K8sClient
}

// GET /api/v1/tenants/{cluster}/{name}/alerts
// Returns all firing/pending alerts for tenant's namespaces
func (h *OpsHandler) HandleAlerts(w http.ResponseWriter, r *http.Request) {
    // Get tenant's namespaces from ArgoCD AppProject
    // Query Alertmanager API: /api/v2/alerts?filter=namespace=~"ns1|ns2"
    // Return aggregated, sorted by severity
}

// GET /api/v1/tenants/{cluster}/{name}/activity
// Returns Git commit history from both repos as unified activity feed
func (h *OpsHandler) HandleActivity(w http.ResponseWriter, r *http.Request) {
    // Fetch recent commits from onboarding repo (tenant's values.yaml)
    // Fetch recent commits from tenant GitOps repo (apps/, resources/)
    // Merge, sort by timestamp, return
}
```

## Server-Sent Events (SSE)

Real-time updates for the frontend without polling:

```go
// GET /api/v1/events
func (h *SSEHandler) HandleSSE(w http.ResponseWriter, r *http.Request) {
    // Set headers: Content-Type: text/event-stream, Cache-Control: no-cache
    // Watch ArgoCD Applications (via K8s watch or ArgoCD API)
    // Watch Crossplane resources (via K8s watch)
    // Emit events: sync-status-changed, resource-status-changed, alert-fired
    // Scope events to user's authorized tenants
}
```

Event types:
- `sync-status-changed`: app sync status update (data: app name, new status)
- `resource-status-changed`: Crossplane resource status (data: resource name, new status)
- `alert-fired`: new alert (data: alert name, severity, app)
- `alert-resolved`: alert cleared
- `deploy-completed`: Git commit + ArgoCD sync done

## Feature Discovery via Annotations

The portal reads annotations on ArgoCD Applications to discover integrations:

```go
// Read annotations from ArgoCD Application
func (h *AppsHandler) enrichWithAnnotations(app *ArgoApplication) AppDetail {
    return AppDetail{
        CIURL:       app.Annotations["argoplane.io/ci-url"],
        RegistryURL: app.Annotations["argoplane.io/registry-url"],
        GrafanaURL:  app.Annotations["argoplane.io/grafana-url"],
        DocsURL:     app.Annotations["argoplane.io/docs-url"],
        RunbookURL:  app.Annotations["argoplane.io/runbook-url"],
    }
}
```

No hardcoded integrations. Platform teams annotate what they want visible.

## Key Dependencies

- `golang.org/x/oauth2` + `github.com/coreos/go-oidc/v3` - OIDC auth
- `k8s.io/client-go` - Kubernetes API access
- `github.com/go-git/go-git/v5` - Git operations (or shell out to git CLI)
- `log/slog` - structured logging
- `github.com/kelseyhightower/envconfig` - configuration

## Go Conventions

Follow all conventions from `.claude/rules/go.md`:
- Three-group imports (stdlib, external, internal)
- `New<Type>` constructors with functional options
- Context as first parameter
- Error wrapping with `%w`
- `log/slog` for structured logging
- Graceful shutdown via `signal.NotifyContext`

## After Scaffolding

- Run `go mod tidy`
- Create `.env.example` with all required variables
- Add `deploy/docker/Dockerfile.portal` (multi-stage: Go builder + static files + Alpine)
- Add portal to Helm chart values (`deploy/helm/argoplane/`)
- Update docs in `services/docs/`
