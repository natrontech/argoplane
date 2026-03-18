# CI/CD Conventions

## Overview

GitHub Actions handles CI and releases. All container images are published to GitHub Container Registry (`ghcr.io/natrontech/`). The Helm chart is published as an OCI artifact to `ghcr.io/natrontech/charts/`.

## Workflows

Two workflows in `.github/workflows/`:

- **`ci.yml`**: runs on push to `main` and pull requests. Lints Go backends, builds UI extensions, builds docs, lints Helm chart, test-builds Docker images.
- **`release.yml`**: runs on `v*` tags. Builds and pushes all container images (multi-arch: amd64 + arm64), packages and pushes the Helm chart.

## Release Process

1. Update `deploy/helm/argoplane/Chart.yaml` version and appVersion to match the release
2. Create and push a tag: `git tag v0.2.0 && git push origin v0.2.0`
3. The release workflow builds all images, tags them with the version, and publishes the Helm chart
4. Images are tagged with: full semver (`0.2.0`), major.minor (`0.2`), and git SHA

The release workflow automatically updates Chart.yaml during packaging so the published chart matches the tag.

## Container Images

| Image | Source | Registry |
|-------|--------|----------|
| `argoplane-metrics-backend` | `extensions/metrics/backend/Dockerfile` | `ghcr.io/natrontech/argoplane-metrics-backend` |
| `argoplane-backups-backend` | `extensions/backups/backend/Dockerfile` | `ghcr.io/natrontech/argoplane-backups-backend` |
| `argoplane-networking-backend` | `extensions/networking/backend/Dockerfile` | `ghcr.io/natrontech/argoplane-networking-backend` |
| `argoplane-logs-backend` | `extensions/logs/backend/Dockerfile` | `ghcr.io/natrontech/argoplane-logs-backend` |
| `argoplane-vulnerabilities-backend` | `extensions/vulnerabilities/backend/Dockerfile` | `ghcr.io/natrontech/argoplane-vulnerabilities-backend` |
| `argoplane-ui-extensions` | `deploy/docker/Dockerfile.ui-extensions` | `ghcr.io/natrontech/argoplane-ui-extensions` |
| `argoplane-docs` | `services/docs/Dockerfile` | `ghcr.io/natrontech/argoplane-docs` |

## Helm Chart

Published as OCI artifact: `oci://ghcr.io/natrontech/charts/argoplane`

Install: `helm install argoplane oci://ghcr.io/natrontech/charts/argoplane --version 0.2.0`

## Consistency Check

`hack/check-extension-consistency.sh` validates that every extension under `extensions/*/backend/Dockerfile` is registered in all required locations. It runs as a CI job on every push and PR. Run it locally before committing:

```bash
bash hack/check-extension-consistency.sh
```

The script auto-discovers extensions from the filesystem and checks 9 locations for each one.

## Adding a New Extension to CI/CD

When adding a new extension, update all of these (the consistency check will catch anything you miss):

1. `Makefile` (`EXTENSIONS` list)
2. `.github/workflows/ci.yml` (`matrix.extension` array)
3. `.github/workflows/release.yml` (`matrix.extension` array + UI build loop)
4. `.github/dependabot.yml` (gomod, npm, docker entries)
5. `deploy/docker/Dockerfile.ui-extensions` (`COPY` line for JS bundle)
6. `deploy/helm/argoplane/values.yaml` (extension config block + image)
7. `deploy/argocd/proxy-extensions.json` (proxy routing entry)
8. `deploy/extensions/<name>/deployment.yaml` (K8s manifests)
9. `hack/setup-argocd.sh` (RBAC entry)

## Rules

- Never push images from local machines. All publishing goes through GitHub Actions.
- Never skip CI checks on PRs. The `ci.yml` workflow must pass before merge.
- All backend images use multi-stage builds (Go builder + Alpine runtime).
- All images run as non-root (`USER 65534:65534`).
- Use GitHub Actions cache (`type=gha`) for Docker layer caching.
- Dependabot keeps all dependencies current (monthly schedule).
- The Helm chart version always matches the release tag version.
