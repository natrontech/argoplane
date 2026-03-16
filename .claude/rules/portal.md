# Portal Conventions

## Overview

The ArgoPlane Portal is a standalone self-service platform built with SvelteKit (frontend) and Go (backend). It lives at `services/portal/`.

## Architecture

Single Go binary serves REST API + SvelteKit static files:

```
services/portal/
  frontend/          # SvelteKit + TypeScript + Tailwind v4 + shadcn-svelte
  backend/           # Go HTTP server
```

In development, the SvelteKit dev server proxies `/api/*` to the Go backend. In production, Go serves the built static files and the API from the same port.

## Frontend (SvelteKit)

- **Stack**: SvelteKit + TypeScript + Tailwind CSS v4 + shadcn-svelte
- **Adapter**: `@sveltejs/adapter-static` (output is static files served by Go)
- **Design**: follows ArgoPlane design system (see `design.md`)
- **Components**: always use shadcn-svelte as the base. Customize to match ArgoPlane tokens.
- **State**: use SvelteKit's built-in stores and `$state` runes. No external state library.
- **API calls**: fetch from `/api/v1/*` (proxied to Go backend in dev, same origin in prod)

### Route Structure

```
src/routes/
  +layout.svelte              # Root layout
  +page.svelte                # Landing / login
  (app)/                      # Authenticated route group
    +layout.svelte            # App shell (sidebar, header, breadcrumbs)
    +layout.ts                # Auth guard (redirect if not logged in)
    dashboard/+page.svelte    # Tenant dashboard (apps, sync status, resources)
    catalog/
      +page.svelte            # Service catalog browser (what the tenant chart offers)
      [feature]/+page.svelte  # Feature detail + enable/configure form
    apps/
      +page.svelte            # Tenant's applications
      new/+page.svelte        # Deploy new app wizard
    tenants/
      +page.svelte            # Tenant list (platform eng view)
      new/+page.svelte        # Onboard new tenant wizard
      [tenant]/
        +page.svelte          # Tenant detail (status, config, membership)
        membership/+page.svelte  # OIDC group → role assignment
    clusters/
      +page.svelte            # Cluster list (which clusters, which tenants)
```

## Backend (Go)

Follows the same Go conventions as extension backends (see `go.md`). Key differences from extension backends:

### Auth: OIDC via Dex

The portal authenticates directly with ArgoCD's Dex instance, not through ArgoCD's proxy. The Go backend:

1. Redirects to Dex for login (`/api/v1/auth/login`)
2. Handles the OIDC callback (`/api/v1/auth/callback`)
3. Creates a session (secure HTTP-only cookie)
4. Validates session on every `/api/v1/*` request
5. Exposes user info (`/api/v1/auth/me`)

Register the portal as a `staticClient` in Dex's config:

```yaml
staticClients:
  - id: argoplane-portal
    name: ArgoPlane Portal
    redirectURIs:
      - http://localhost:8080/api/v1/auth/callback
    secretEnv: ARGOPLANE_PORTAL_CLIENT_SECRET
```

### K8s Access

Use `client-go` for:
- Reading Crossplane XRDs with `argoplane.io/catalog: "true"` label (service catalog)
- Reading catalog ConfigMap for Helm chart templates (app deployment catalog)
- Reading tenant status (namespaces, AppProjects, Applications)
- Reading AppProject resource whitelists (filter catalog by tenant permissions)

For in-cluster: automatic service account. For dev: kubeconfig.

### ArgoCD API Access

Use ArgoCD's REST API for:
- Applications: list, get, sync status per tenant
- Projects: read tenant AppProjects, role assignments
- Clusters: registered cluster info (which clusters tenants can deploy to)

Authenticate with a service account token or forward the user's OIDC token.

### Git Access (Two Repos)

The portal commits to two Git repos:

**Tenant onboarding repo** (platform-managed, shared):
- **Tenant onboarding**: create `tenants/<cluster>/<tenant>/values.yaml` and commit
- **Tenant config changes**: update values.yaml (membership, quotas, allowed resources) and commit

**Tenant GitOps repo** (per-tenant, tenant-owned):
- **App deploys**: generate ArgoCD Application manifest (referencing common Helm chart with values), commit to `apps/<name>.yaml`
- **Platform resources**: generate Crossplane XRD claim manifest, commit to `resources/<name>/claim.yaml`
- All portal-generated resources carry `argoplane.io/managed-by: portal` annotation

Use GitHub/GitLab REST API for single-file operations (stateless, no clone needed). Use shallow clones for multi-file operations. Authenticate with GitHub App tokens or deploy keys via ArgoCD repocreds.

### API Routes

```go
// Auth
mux.HandleFunc("GET /api/v1/auth/login", s.handleLogin)
mux.HandleFunc("GET /api/v1/auth/callback", s.handleCallback)
mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)
mux.HandleFunc("GET /api/v1/auth/me", s.handleMe)

// Tenants
mux.HandleFunc("GET /api/v1/tenants", s.handleTenants)
mux.HandleFunc("POST /api/v1/tenants", s.handleCreateTenant)
mux.HandleFunc("GET /api/v1/tenants/{cluster}/{name}", s.handleTenant)
mux.HandleFunc("PUT /api/v1/tenants/{cluster}/{name}", s.handleUpdateTenant)

// Tenant membership (OIDC group → role assignments)
mux.HandleFunc("GET /api/v1/tenants/{cluster}/{name}/membership", s.handleMembership)
mux.HandleFunc("PUT /api/v1/tenants/{cluster}/{name}/membership", s.handleUpdateMembership)

// Service catalog (authenticated)
mux.HandleFunc("GET /api/v1/catalog/charts", s.handleCharts)    // Helm chart templates from ConfigMap
mux.HandleFunc("GET /api/v1/catalog/xrds", s.handleXRDs)        // Crossplane XRDs with catalog label

// Applications (tenant-scoped, writes to tenant GitOps repo)
mux.HandleFunc("GET /api/v1/apps", s.handleApps)
mux.HandleFunc("POST /api/v1/apps", s.handleCreateApp)
mux.HandleFunc("GET /api/v1/apps/{namespace}/{name}", s.handleApp)
mux.HandleFunc("PUT /api/v1/apps/{namespace}/{name}", s.handleUpdateApp)
mux.HandleFunc("DELETE /api/v1/apps/{namespace}/{name}", s.handleDeleteApp)

// Platform resources (tenant-scoped, writes to tenant GitOps repo)
mux.HandleFunc("GET /api/v1/resources", s.handleResources)
mux.HandleFunc("POST /api/v1/resources", s.handleCreateResource)
mux.HandleFunc("DELETE /api/v1/resources/{namespace}/{name}", s.handleDeleteResource)

// Clusters
mux.HandleFunc("GET /api/v1/clusters", s.handleClusters)

// Health
mux.HandleFunc("GET /api/v1/health", s.handleHealth)
```

### Configuration

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
    LogLevel         string `envconfig:"LOG_LEVEL" default:"info"`
    StaticDir        string `envconfig:"STATIC_DIR" default:"./static"`
}
```

## Multi-Tenancy

OIDC groups from Dex map to tenants via the tenant values.yaml roles and ArgoCD AppProject role bindings:

```
OIDC groups → Tenant AppProject roles → Scoped access
```

The portal reads tenant configurations from the onboarding repo and ArgoCD AppProjects to determine which tenants a user can see and manage. For each authorized tenant, the portal also reads the tenant's GitOps repo to show apps and resources. Users only see tenants where their OIDC groups match a role.

## Deployment

**Production**: Helm chart at `deploy/helm/argoplane/` includes the portal as a Deployment + Service. Static files are embedded in the Go binary or served from a volume.

**Development**:
```sh
# Terminal 1: SvelteKit dev server (hot reload)
cd services/portal/frontend && npm run dev    # :5173, proxies /api to :8080

# Terminal 2: Go backend
cd services/portal/backend && go run ./cmd/   # :8080
```

## What the Portal Does NOT Do

- No CI/CD (that's GitHub Actions / GitLab CI)
- No monitoring dashboards (that's Grafana; extensions handle contextual metrics)
- No secret management (that's the platform team's domain; handled via operators like ESO, OpenBao, etc.)
- No direct K8s mutations (commit to Git, ArgoCD syncs)
- No RBAC policy editing (platform team owns role definitions in the tenant chart; portal only manages group-to-role assignments)
- No tenant chart editing (platform team owns the chart; portal only generates values.yaml for the onboarding repo)
- No common chart editing (platform team owns the common Helm chart; portal only fills in values)
- No Backstage (purpose-built for ArgoCD platforms, not a generic plugin framework)
