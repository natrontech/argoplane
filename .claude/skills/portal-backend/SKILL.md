---
name: portal-backend
description: Scaffold and develop the ArgoPlane Portal Go backend. Use when the user wants to build portal API endpoints, set up OIDC auth, add K8s/ArgoCD integration, or work on the portal's Go server. Trigger when the user mentions "portal backend", "portal API", "portal auth", "RBAC editor", "team onboarding API", "service catalog API", or wants to build Go code for the portal.
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
6. Commits to Git repos for progressive GitOps

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
    catalog/
      xrd.go                   # Crossplane XRD listing and details
      storage.go               # StorageClass discovery
      ingress.go               # IngressClass discovery
    apps/
      handler.go               # Application CRUD (via Git commits + ArgoCD API)
      manifest.go              # Manifest generation (Deployment, Service, Ingress)
    claims/
      handler.go               # Crossplane claim CRUD (via Git commits)
      form.go                  # XRD schema to form field mapping
    teams/
      handler.go               # Team management (namespace + AppProject + RBAC)
      onboarding.go            # Team onboarding workflow
    admin/
      rbac.go                  # RBAC editor (read/write argocd-rbac-cm)
      projects.go              # AppProject CRUD
      clusters.go              # Cluster inventory
    argocd/
      client.go                # ArgoCD REST API client
    gitops/
      repo.go                  # Git operations (clone, commit, push)
      manifest.go              # YAML generation helpers
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
    GitRepoURL       string `envconfig:"GIT_REPO_URL"`
    GitBranch        string `envconfig:"GIT_BRANCH" default:"main"`
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

// Service catalog (authenticated)
mux.HandleFunc("GET /api/v1/catalog/xrds", s.catalog.HandleXRDs)
mux.HandleFunc("GET /api/v1/catalog/xrds/{name}", s.catalog.HandleXRD)
mux.HandleFunc("GET /api/v1/catalog/storageclasses", s.catalog.HandleStorageClasses)
mux.HandleFunc("GET /api/v1/catalog/ingressclasses", s.catalog.HandleIngressClasses)

// Applications (authenticated, team-scoped)
mux.HandleFunc("GET /api/v1/apps", s.apps.HandleList)
mux.HandleFunc("POST /api/v1/apps", s.apps.HandleCreate)
mux.HandleFunc("GET /api/v1/apps/{namespace}/{name}", s.apps.HandleGet)

// Claims (authenticated, team-scoped)
mux.HandleFunc("GET /api/v1/claims", s.claims.HandleList)
mux.HandleFunc("POST /api/v1/claims", s.claims.HandleCreate)
mux.HandleFunc("DELETE /api/v1/claims/{namespace}/{name}", s.claims.HandleDelete)

// Teams (authenticated)
mux.HandleFunc("GET /api/v1/teams", s.teams.HandleList)
mux.HandleFunc("POST /api/v1/teams", s.teams.HandleCreate)
mux.HandleFunc("GET /api/v1/teams/{name}", s.teams.HandleGet)

// Admin: RBAC (authenticated, admin-only)
mux.HandleFunc("GET /api/v1/admin/rbac", s.admin.HandleRBAC)
mux.HandleFunc("PUT /api/v1/admin/rbac", s.admin.HandleUpdateRBAC)

// Admin: Projects (authenticated, admin-only)
mux.HandleFunc("GET /api/v1/admin/projects", s.admin.HandleProjects)
mux.HandleFunc("POST /api/v1/admin/projects", s.admin.HandleCreateProject)
mux.HandleFunc("PUT /api/v1/admin/projects/{name}", s.admin.HandleUpdateProject)
mux.HandleFunc("DELETE /api/v1/admin/projects/{name}", s.admin.HandleDeleteProject)

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

OIDC groups from Dex map to allowed namespaces:

```go
func (s *Server) authorizedNamespaces(ctx context.Context, groups []string) ([]string, error) {
    // Map OIDC groups to Kubernetes namespaces
    // Check ArgoCD AppProjects for group-to-namespace mappings
    // Return only namespaces the user's groups have access to
}
```

All queries are scoped by the user's authorized namespaces. Never return resources from namespaces the user doesn't have access to.

## Git Operations (Progressive GitOps)

For app deploys and claim creation, the portal commits to Git:

```go
type GitOpsRepo struct {
    repoURL  string
    branch   string
    // auth: deploy key or GitHub App token
}

func (g *GitOpsRepo) CommitManifest(ctx context.Context, teamDir, filename string, manifest []byte, message string) error {
    // Clone repo (or pull latest)
    // Write manifest to teams/<team>/<filename>
    // Git add, commit, push
    // ArgoCD picks up the change and syncs
}
```

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
