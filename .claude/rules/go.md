# Go Conventions

## Philosophy

Write idiomatic Go. Follow [Effective Go](https://go.dev/doc/effective_go) and [The Zen of Go](https://the-zen-of-go.netlify.app/) by Dave Cheney. Key principles:

- Each package fulfils a single purpose
- Handle errors explicitly
- Return early rather than nesting deeply
- Write for clarity, not cleverness
- A little copying is better than a little dependency
- Simplicity is not a goal, it is the prerequisite

## Imports

Three groups separated by blank lines: stdlib, external, internal.

```go
import (
    "context"
    "fmt"
    "log/slog"
    "net/http"

    "github.com/prometheus/client_golang/api"

    "github.com/natrontech/argoplane/extensions/metrics/internal/query"
)
```

Always use full module paths. No relative imports.

## Naming

- **Exported**: PascalCase (`CreateBackup`, `MetricQuery`, `NewServer`)
- **Unexported**: camelCase (`parseLabels`, `buildQuery`)
- **Constructors**: `New<Type>(...) (*Type, error)`
- **Method receivers**: short names (`s *Server`, `c *Client`, `q *Querier`)
- **Interfaces**: semantic names (Querier, BackupLister, MetricFetcher). No forced `-er` suffix.
- **Packages**: single lowercase word (`metrics`, `backups`, `proxy`)
- **No `Get`/`List` prefixes**: follow stdlib convention. `Backups()` not `GetBackups()` or `ListBackups()`. `Create`, `Delete`, `Trigger` verbs are fine since they denote actions.

## Error Handling

```go
if err != nil {
    return nil, fmt.Errorf("failed to <action>: %w", err)
}
```

Always wrap with context using `%w`. Use `slog.Error()` before `os.Exit(1)` in main.

## Logging

`log/slog` with structured key-value pairs:

```go
slog.Info("querying prometheus", "url", config.PrometheusURL, "query", query)
slog.Error("failed to fetch backups", "error", err, "namespace", ns)
```

Levels: debug, info, warn, error.

## Configuration

`envconfig` struct tags. Load in `main()`, pass values to constructors.

```go
type Config struct {
    Port          string `envconfig:"PORT" default:"8080"`
    PrometheusURL string `envconfig:"PROMETHEUS_URL" required:"true"`
    LogLevel      string `envconfig:"LOG_LEVEL" default:"info"`
}
```

## HTTP Handlers

Extension backends are HTTP servers (not gRPC). Use `net/http` stdlib:

```go
mux := http.NewServeMux()
mux.HandleFunc("GET /api/v1/metrics", s.handleMetrics)
mux.HandleFunc("GET /api/v1/backups", s.handleBackups)
mux.HandleFunc("POST /api/v1/backups/{name}/restore", s.handleRestore)
```

Use Go 1.22+ routing patterns with method and path parameters.

## ArgoCD Headers

Backend services receive identity headers from ArgoCD's proxy. Use them for authorization and scoping:

```go
func userFromRequest(r *http.Request) (username string, groups []string) {
    username = r.Header.Get("Argocd-Username")
    groups = strings.Split(r.Header.Get("Argocd-User-Groups"), ",")
    return
}

func clusterFromRequest(r *http.Request) (name, url string) {
    name = r.Header.Get("Argocd-Target-Cluster-Name")
    url = r.Header.Get("Argocd-Target-Cluster-URL")
    return
}
```

## File Organization

- **Naming**: feature-based (`backup.go`, `query.go`, `server.go`)
- **Generated code**: `.gen.go` suffix or `generated.go`
- **Structure within file**: package decl, imports, types/interfaces, constructors, methods, helpers
- **Tests**: `_test.go` suffix. Standard `testing` package.

## Dependencies

Run `go mod tidy` after adding or removing dependencies. Keep dependency count low. Prefer stdlib.

## Patterns

- **Context**: always first parameter (`ctx context.Context`)
- **Options pattern**: `With<Option>(value)` for optional constructor params
- **Dependency injection**: interfaces passed to constructors, not globals
- **Graceful shutdown**: `signal.NotifyContext` + `http.Server.Shutdown`
