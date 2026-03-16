---
name: sveltekit
description: Scaffold and set up SvelteKit + TypeScript + Tailwind CSS v4 + shadcn-svelte projects for ArgoPlane. Use this skill for the self-service portal frontend, documentation site, or any SvelteKit-based service. Trigger when the user mentions "portal frontend", "self-service UI", "docs site", "SvelteKit", "shadcn-svelte", or wants to build a developer-facing UI outside of ArgoCD extensions.
---

# SvelteKit Project Setup

This skill scaffolds and configures SvelteKit projects for ArgoPlane. It covers two main surfaces:

1. **Portal frontend** (`services/portal/frontend/`): standalone web app for self-service platform capabilities
2. **Documentation site** (`services/docs/`): mdsvex-powered docs site at docs.argoplane.io

Both share the same design system (Tailwind v4 + shadcn-svelte + ArgoPlane tokens).

## Stack

- **SvelteKit** with TypeScript (strict mode)
- **Tailwind CSS v4** for styling
- **shadcn-svelte** for headless UI components
- **Heebo** font (body) + **JetBrains Mono** (data/code)

## Portal Frontend Architecture

The portal frontend is part of a larger system:

- **Frontend** (SvelteKit): static files served by the Go backend in production
- **Backend** (Go at `services/portal/backend/`): REST API at `/api/v1/*`, OIDC auth, K8s access, ArgoCD API, Git operations
- **Auth**: OIDC via ArgoCD's Dex instance (same users, same groups as ArgoCD)
- **Adapter**: `@sveltejs/adapter-static` (output is static files, Go serves them)

In development, Vite proxies `/api/*` to the Go backend running on a separate port.

## Scaffolding the portal frontend

If the portal frontend doesn't exist yet, scaffold it under `services/portal/frontend/`.

### Step 1: Create the SvelteKit project

```bash
cd /Users/janlauber/code/github.com/natrontech/argoplane/services/portal
npx sv create frontend --template minimal --types ts --no-add-ons --no-install
cd frontend
npm install
```

### Step 2: Add Tailwind CSS v4

```bash
npx sv add tailwindcss
```

This installs `@tailwindcss/vite` and creates `src/app.css`. Replace the contents of `src/app.css` with the ArgoPlane theme. Read `references/tailwind-theme.md` for the exact `@theme` block and base styles.

### Step 3: Add shadcn-svelte

```bash
npx shadcn-svelte@next init
```

When prompted:
- Style: **Default**
- Base color: **Stone** (closest to ArgoPlane warm grays)
- CSS variables: **Yes**

Then customize `components.json` to use `rounded-md` (4px) as the default radius.

### Step 4: Add Google Fonts

In `src/app.html`, add font links in `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Step 5: Configure adapter-static

Install and configure `@sveltejs/adapter-static`:

```bash
npm install -D @sveltejs/adapter-static
```

In `svelte.config.js`:
```javascript
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',  // SPA fallback for client-side routing
    }),
  },
};
```

### Step 6: Configure Vite proxy

In `vite.config.ts`, proxy API calls to the Go backend:

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
```

### Step 7: Create base layout

Create `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100">
  {@render children()}
</div>
```

## Adding shadcn-svelte components

Install components as needed:

```bash
npx shadcn-svelte@next add button
npx shadcn-svelte@next add card
npx shadcn-svelte@next add table
npx shadcn-svelte@next add dialog
npx shadcn-svelte@next add select
npx shadcn-svelte@next add input
npx shadcn-svelte@next add badge
```

After adding, customize each component's styles to match ArgoPlane:

- **Buttons**: `bg-orange-500 hover:bg-orange-600 text-white rounded-md` (no rounded-full, no shadow)
- **Cards**: `border border-gray-200 rounded-md` (no shadow)
- **Inputs**: `border border-gray-200 focus:border-orange-500 rounded-md`
- **Tables**: `border-collapse`, 1px borders, `font-mono` for data cells
- **Dialogs**: `rounded-md`, no shadow, 1px border
- **Badges/Status**: 8x8px colored squares (not circles, not pills)

## Design rules

These are non-negotiable. They come from the ArgoPlane design system in `design-system/tokens.css`.

1. **4px grid**: All spacing must be multiples of 4px. Use Tailwind spacing scale (1=4px, 2=8px, etc.)
2. **1px borders only**: `border` not `border-2`. Exception: table header bottom can be 2px
3. **Max border-radius 4px**: Use `rounded-sm` (2px) or `rounded-md` (4px). Never `rounded-lg`, `rounded-xl`, `rounded-full`
4. **No shadows**: Never use `shadow-*` classes
5. **No gradients**: Never use `bg-gradient-*` classes
6. **No animations > 150ms**: Keep transitions snappy
7. **Max font size 20px**: `text-xl` is the ceiling. No `text-2xl`+
8. **Monospace for data**: All values, timestamps, resource names, code use `font-mono`
9. **Status = colored squares**: 8x8px with `rounded-sm`. Not circles, not dots
10. **No hardcoded colors**: Use the theme tokens defined in `@theme`

## Dark mode

Use Tailwind's `dark:` variant. The semantic mappings:

| Light | Dark |
|-------|------|
| `bg-white` | `dark:bg-gray-900` |
| `bg-gray-50` | `dark:bg-gray-800` |
| `text-gray-800` | `dark:text-gray-100` |
| `text-gray-500` | `dark:text-gray-400` |
| `border-gray-200` | `dark:border-gray-700` |
| `text-orange-500` | `dark:text-orange-400` |

## File structure (portal frontend)

```
services/portal/frontend/
  src/
    routes/
      +layout.svelte              # Root layout
      +page.svelte                # Landing / login
      (app)/                      # Authenticated route group
        +layout.svelte            # App shell (sidebar, header, breadcrumbs)
        +layout.ts                # Auth guard
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
    lib/
      components/
        ui/                       # shadcn-svelte components (auto-generated)
        app/                      # App-specific components (sidebar, header, etc.)
      api/                        # API client functions (fetch from /api/v1/*)
      types/                      # TypeScript type definitions
      stores/                     # Svelte stores (auth state, theme, etc.)
    app.css                       # Tailwind v4 theme with ArgoPlane tokens
    app.html                      # HTML shell with font links
  static/
  svelte.config.js
  vite.config.ts
  tsconfig.json
  package.json
```

## Scaffolding a docs site

The documentation site lives at `services/docs/`. It uses the same SvelteKit + Tailwind v4 stack but adds:

- **mdsvex**: Svelte markdown preprocessor (`.svx` files as routes)
- **@sveltejs/adapter-node**: Node.js runtime (prerendered pages, but allows SSR/API routes later)
- **Shiki**: build-time syntax highlighting
- **rehype-slug** + **rehype-autolink-headings**: heading anchors
- **remark-gfm**: GitHub-flavored markdown (tables, strikethrough)
- **Pagefind** (optional): static search indexing

### Key differences from portal

| Aspect | Portal frontend | Docs site |
|--------|----------------|-----------|
| Content | Svelte components | mdsvex markdown (.svx) |
| Adapter | adapter-static (served by Go) | adapter-node (prerendered) |
| Layout | App shell (sidebar, dashboard) | 3-column docs (sidebar nav, content, TOC) |
| Auth | OIDC via Go backend | None (public) |
| Search | N/A | Pagefind (static WASM) |

### File structure (docs)

```
services/docs/
  src/
    routes/
      +layout.svelte        # 3-column layout: sidebar | content | TOC
      +layout.ts             # export const prerender = true
      +page.svx              # Home page (markdown)
      getting-started/+page.svx
      architecture/+page.svx
      extensions/
        metrics/+page.svx
        backups/+page.svx
      portal/
        overview/+page.svx
        service-catalog/+page.svx
        team-onboarding/+page.svx
        rbac-management/+page.svx
        progressive-gitops/+page.svx
      developing/
        +page.svx
        ui-extensions/+page.svx
        backend-services/+page.svx
        portal-backend/+page.svx
        design-system/+page.svx
    lib/
      components/docs/       # Sidebar, TOC, Header, Callout, PrevNext
      config/navigation.ts   # Sidebar tree definition
      config/site.ts         # Site metadata
    app.css                  # Same ArgoPlane Tailwind v4 theme
    app.html                 # Fonts
  svelte.config.js           # mdsvex + adapter-node
  Dockerfile                 # node:20-alpine
```

### Content format

All pages use `.svx` files with frontmatter:

```markdown
---
title: Page Title
description: One-line description
---

# Page Title

Markdown content here. Code blocks get Shiki highlighting.
```

## Reference

For the complete Tailwind v4 `@theme` configuration with all ArgoPlane color values, spacing, and typography, read `references/tailwind-theme.md`.

For the authoritative design token values, read `design-system/tokens.css` in the repo root.

For component class examples, read `design-system/components.css` in the repo root.
