---
name: new-extension
description: Scaffold a new ArgoCD UI extension with React frontend and Go backend. Use when the user wants to create a new extension for a domain (e.g., logs, networking, security).
user-invocable: true
argument-hint: "[domain-name]"
allowed-tools: Bash(mkdir *), Write, Read, Glob
---

# Create New ArgoCD Extension

Scaffold a new ArgoPlane extension for the domain: **$ARGUMENTS**

## Directory Structure to Create

```
extensions/$ARGUMENTS/
  ui/
    src/
      index.tsx              # Extension registration entry point
      api.ts                 # Proxy API client functions
      components/
        ${PascalCase}Panel.tsx   # Main component
    package.json
    tsconfig.json
    webpack.config.js
  backend/
    cmd/
      main.go                # HTTP server entry point
    internal/                 # Internal packages
    go.mod
    Dockerfile
    .env.example
```

## Implementation Checklist

1. Create the directory structure above
2. **UI entry point** (`index.tsx`): register via `window.extensionsAPI.registerResourceExtension` or `registerStatusPanelExtension`
3. **API client** (`api.ts`): fetch from `/extensions/$ARGUMENTS/api/v1/...` with ArgoCD headers
4. **React component**: display domain-specific data, handle loading/error states
5. **Go backend** (`cmd/main.go`): HTTP server with health check and domain API endpoints
6. **Dockerfile**: multi-stage build (Go builder + Alpine runtime)
7. **package.json**: copy from existing extension, update name to `@argoplane/extension-$ARGUMENTS`
8. **webpack.config.js**: copy from existing extension, update output filename to `extension-$ARGUMENTS.js`

## After Scaffolding

- Add `$ARGUMENTS` to the `EXTENSIONS` variable in the root `Makefile`
- Add deployment manifests in `deploy/extensions/$ARGUMENTS/deployment.yaml`
- Add proxy extension config in `deploy/argocd/proxy-extensions.json`
- Run `go mod tidy` in the backend directory
- Run `npm install` in the ui directory
- Test build: `npm run build` in ui, `go build -o /tmp/test ./cmd/` in backend
- Add dependabot entries in `.github/dependabot.yml` for the new extension (gomod, npm, docker ecosystems with monthly schedule and grouped updates)

## Naming Convention

- Extension directory: lowercase domain name (e.g., `logs`, `networking`, `security`)
- UI bundle output: `extension-$ARGUMENTS.js`
- Backend image: `argoplane-$ARGUMENTS-backend`
- Kubernetes service: `argoplane-$ARGUMENTS-backend`
- Proxy extension name in ArgoCD config: `$ARGUMENTS`

## Copy Patterns From

Use `extensions/metrics/` as the reference implementation for the structure.
Use `extensions/backups/` as reference for status panel extensions with flyout.
