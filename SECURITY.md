# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in ArgoPlane, please report it responsibly. **Do not open a public GitHub issue.**

Email **[security@natron.io](mailto:security@natron.io)** with:

- A description of the vulnerability
- Steps to reproduce
- Affected versions
- Any potential impact assessment

## Response Timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix or mitigation**: depends on severity, but we aim for patches within 30 days for critical issues

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous minor | Best effort |
| Older | No |

## Scope

This policy covers:

- ArgoCD extension backends (Go services)
- ArgoCD extension UIs (React/TypeScript bundles)
- Helm chart templates and default configurations
- CI/CD workflows and container images

Out of scope:

- ArgoCD itself (report to [argoproj/argo-cd](https://github.com/argoproj/argo-cd/security))
- Third-party operators (Prometheus, Velero, Cilium, Trivy, etc.)
- Vulnerabilities in dependencies that are already publicly disclosed (open a regular issue instead)

## Disclosure

We follow coordinated disclosure. Once a fix is available, we will:

1. Release a patched version
2. Publish a security advisory on GitHub
3. Credit the reporter (unless they prefer anonymity)

Thank you for helping keep ArgoPlane secure.
