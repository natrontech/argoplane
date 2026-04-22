# Contributing to ArgoPlane

Thanks for your interest in contributing to ArgoPlane! Whether it's a bug report, feature request, or code contribution, we appreciate your help.

## Quick links

- [Development setup](https://argoplane.io/developing)
- [Architecture overview](https://argoplane.io/architecture)
- [Extension development guide](https://argoplane.io/developing/ui-extensions)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

## Getting started

```bash
make dev-infra            # Create kind cluster + install ArgoCD
make build-extensions     # Build all UI extension bundles
make setup-argocd         # Deploy extensions to local cluster
make deploy-example       # Deploy demo app
make test-integration     # Run integration tests
```

Prerequisites: [kind](https://kind.sigs.k8s.io/), [kubectl](https://kubernetes.io/docs/tasks/tools/), [helm](https://helm.sh/), [Node.js 20+](https://nodejs.org/), [Go 1.26+](https://go.dev/).

## How to contribute

### Bug reports

[Open an issue](https://github.com/natrontech/argoplane/issues/new?template=bug_report.md) with:

- ArgoCD version and ArgoPlane version
- Steps to reproduce
- Expected vs. actual behavior
- Logs if available (backend service logs, browser console)

### Feature requests

[Open an issue](https://github.com/natrontech/argoplane/issues/new?template=feature_request.md) describing:

- The problem you're trying to solve
- Your proposed solution
- Which extension or component it affects

### Pull requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `make build-extensions` and `make test-integration` pass
4. Update documentation if your change affects user-facing behavior
5. Open a pull request

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(metrics): add Prometheus range query support
fix(backups): handle nil schedule in status panel
docs: update extension API reference
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

## Code style

- **Go**: [Effective Go](https://go.dev/doc/effective_go), `log/slog` for logging, `net/http` stdlib
- **TypeScript/React**: strict mode, PascalCase components, no `any` (except ArgoCD API types)
- **CSS**: design system tokens from `design-system/`, no hardcoded colors, 4px grid

## Repository structure

```
extensions/          # ArgoCD UI extensions (React + Go)
  shared/            # Shared React component library
  metrics/           # Prometheus metrics
  backups/           # Velero backup/restore
  networking/        # Cilium/Hubble network flows
  logs/              # Loki log aggregation
  vulnerabilities/   # Trivy Operator scanning
services/
  docs/              # Documentation site (SvelteKit)
design-system/       # CSS design tokens and components
deploy/              # Helm chart and deployment manifests
hack/                # Dev scripts (kind cluster, ArgoCD setup)
tests/               # Integration tests
```

## Adding a new extension

1. Create `extensions/<name>/ui/` and `extensions/<name>/backend/`
2. Register via `window.extensionsAPI` in `index.tsx`
3. Add deployment manifests in `deploy/extensions/<name>/`
4. Add proxy config in `deploy/argocd/proxy-extensions.json`
5. Add RBAC in `hack/setup-argocd.sh`
6. Add the extension to `EXTENSIONS` in the Makefile
7. Update the demo app in `examples/demo-app/`
8. Add documentation in `services/docs/`
9. Run `bash hack/check-extension-consistency.sh` to verify

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
