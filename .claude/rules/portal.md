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
    dashboard/+page.svelte    # Team dashboard
    catalog/
      +page.svelte            # Service catalog browser
      [xrd]/+page.svelte      # XRD detail + claim form
    apps/
      +page.svelte            # Team's applications
      new/+page.svelte        # Deploy new app wizard
    teams/
      +page.svelte            # Team management
      [team]/+page.svelte     # Team detail
    admin/                    # Platform engineer views
      rbac/+page.svelte       # RBAC editor
      projects/+page.svelte   # AppProject management
      clusters/+page.svelte   # Cluster inventory
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
- Reading Crossplane XRDs and compositions (service catalog)
- Reading StorageClasses, IngressClasses, CRDs (platform inventory)
- Creating/reading namespaces, resource quotas (team onboarding)
- Creating/reading Crossplane claims (self-service)

For in-cluster: automatic service account. For dev: kubeconfig.

### ArgoCD API Access

Use ArgoCD's REST API for:
- Applications: list, get, create, sync status
- Projects: CRUD, role templates
- RBAC: read/write `argocd-rbac-cm` ConfigMap
- Accounts: user management
- Clusters: registered cluster info

Authenticate with a service account token or forward the user's OIDC token.

### Git Access

For the progressive GitOps model, the portal commits to Git repos:
- Portal-managed repos: one repo with team directories
- Team repos: scaffold structure, update image tags

Use a Git library (e.g., `go-git`) or shell out to `git` CLI. Authenticate with deploy keys or GitHub App tokens.

### API Routes

```go
// Auth
mux.HandleFunc("GET /api/v1/auth/login", s.handleLogin)
mux.HandleFunc("GET /api/v1/auth/callback", s.handleCallback)
mux.HandleFunc("POST /api/v1/auth/logout", s.handleLogout)
mux.HandleFunc("GET /api/v1/auth/me", s.handleMe)

// Service catalog
mux.HandleFunc("GET /api/v1/catalog/xrds", s.handleXRDs)
mux.HandleFunc("GET /api/v1/catalog/xrds/{name}", s.handleXRD)
mux.HandleFunc("GET /api/v1/catalog/storageclasses", s.handleStorageClasses)
mux.HandleFunc("GET /api/v1/catalog/ingressclasses", s.handleIngressClasses)

// Applications
mux.HandleFunc("GET /api/v1/apps", s.handleApps)
mux.HandleFunc("POST /api/v1/apps", s.handleCreateApp)
mux.HandleFunc("GET /api/v1/apps/{namespace}/{name}", s.handleApp)

// Claims (Crossplane)
mux.HandleFunc("GET /api/v1/claims", s.handleClaims)
mux.HandleFunc("POST /api/v1/claims", s.handleCreateClaim)
mux.HandleFunc("DELETE /api/v1/claims/{namespace}/{name}", s.handleDeleteClaim)

// Teams
mux.HandleFunc("GET /api/v1/teams", s.handleTeams)
mux.HandleFunc("POST /api/v1/teams", s.handleCreateTeam)
mux.HandleFunc("GET /api/v1/teams/{name}", s.handleTeam)

// Admin: RBAC
mux.HandleFunc("GET /api/v1/admin/rbac", s.handleRBAC)
mux.HandleFunc("PUT /api/v1/admin/rbac", s.handleUpdateRBAC)

// Admin: Projects
mux.HandleFunc("GET /api/v1/admin/projects", s.handleProjects)
mux.HandleFunc("POST /api/v1/admin/projects", s.handleCreateProject)
mux.HandleFunc("PUT /api/v1/admin/projects/{name}", s.handleUpdateProject)
mux.HandleFunc("DELETE /api/v1/admin/projects/{name}", s.handleDeleteProject)

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
    GitRepoURL       string `envconfig:"GIT_REPO_URL"`
    GitBranch        string `envconfig:"GIT_BRANCH" default:"main"`
    LogLevel         string `envconfig:"LOG_LEVEL" default:"info"`
    StaticDir        string `envconfig:"STATIC_DIR" default:"./static"`
}
```

## Multi-Tenancy

OIDC groups from Dex map to teams, namespaces, and ArgoCD AppProjects:

```
OIDC groups → Portal teams → K8s namespaces + ArgoCD AppProjects
```

The portal scopes all queries by the user's groups. Users only see apps, claims, and resources in namespaces their groups have access to.

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
- No secret management (that's External Secrets Operator)
- No direct K8s mutations for app resources (commit to Git, ArgoCD syncs)
- No Backstage (purpose-built for ArgoCD platforms, not a generic plugin framework)
