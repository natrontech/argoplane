# Documentation Maintenance

## Rule

When making changes to extensions, the portal, backend APIs, or the design system, always update the corresponding documentation in `services/docs/`.

## What triggers a docs update

- **New extension**: add `services/docs/src/routes/extensions/<name>/+page.svx` and `services/docs/src/routes/api/<name>/+page.svx`. Update the navigation tree in `src/lib/config/navigation.ts`.
- **Extension API change**: update the API reference page at `services/docs/src/routes/api/<name>/+page.svx`.
- **New portal feature**: update the relevant developing or architecture docs.
- **Design system change**: update `services/docs/src/routes/developing/design-system/+page.svx`.
- **Deployment change**: update `services/docs/src/routes/deployment/+page.svx` (Helm chart, values) or `services/docs/src/routes/deployment/argocd-configuration/+page.svx` (proxy config, RBAC, init containers, styles, Kustomize examples).
- **Helm chart change**: update the deployment docs with new values, templates, or configuration options.
- **New service**: add documentation for the service and update the contributing page's repo structure.

## Navigation

The sidebar navigation is defined in `services/docs/src/lib/config/navigation.ts`. Add new pages to the appropriate section.

## Content format

All content pages use mdsvex (`.svx` files) with frontmatter:

```markdown
---
title: Page Title
description: One-line description
---
```

## Verification

After updating docs, verify the build succeeds:

```bash
cd services/docs && npm run build
```
