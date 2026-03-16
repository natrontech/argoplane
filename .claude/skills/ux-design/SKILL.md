---
name: ux-design
description: Design portal UX flows, page layouts, component compositions, and interaction patterns. Use when the user mentions "UX", "user experience", "page design", "wireframe", "flow", "layout", "interaction", "navigation", "portal design", or wants to plan how a portal feature should look and feel.
user-invocable: true
argument-hint: "[page-or-flow-name]"
allowed-tools: Read, Glob, Grep, Write, Bash(mkdir *)
---

# ArgoPlane Portal UX Design

Design the UX for: **$ARGUMENTS**

## Design Philosophy

ArgoPlane's portal is a developer tool, not a marketing site. Every pixel earns its place. The experience should feel like a well-built CLI with a visual interface: fast, predictable, information-dense, and respectful of the user's time.

### Core Principles

1. **Speed over spectacle.** No loading screens that could be skeletons. No animations that delay information. Optimistic updates where possible. Target < 100ms perceived response time for navigation.

2. **Information density over whitespace.** Developers want data, not padding. Pack information tightly but legibly. Use monospace for all data values. Use the 4px grid but don't waste vertical space.

3. **Progressive disclosure.** Show the important thing first, details on demand. Summary cards expand to tables. Tables expand to detail views. Drawers for quick edits, full pages for complex workflows.

4. **Predictable navigation.** Every page has a consistent URL. Breadcrumbs show where you are. The sidebar shows where you can go. Back button always works. No modals that break the URL.

5. **Keyboard-first.** Command palette (Cmd+K) for global search. Tab navigation for forms. Enter to submit. Escape to close. Arrow keys for lists. Power users never touch the mouse.

6. **Contextual actions.** The right action at the right time. Don't show "Delete" on a page that's about creating. Don't show "Deploy" when there's nothing to deploy. Empty states guide to the first action.

7. **Real-time feedback.** Sync status updates via SSE. Deploy progress shows in real-time. Toast notifications for completed actions. No "refresh to see changes."

8. **Honest states.** Show loading (skeleton), empty (CTA), error (what happened + what to do), and success (what was done + what's next). Never leave the user guessing.

## Visual Language

Read `design-system/tokens.css` for the authoritative values. Key constraints:

- **4px spacing grid** (all margins, padding, gaps)
- **1px borders only** (gray-200 light, gray-700 dark)
- **Max 4px border-radius** (no pills, no circles)
- **No shadows, no gradients** (flat and honest)
- **No animations > 150ms** (snappy transitions)
- **Max font size 20px** (metric values only)
- **Monospace for all data** (JetBrains Mono)
- **Status = 8x8px colored squares** (not circles, not dots)
- **Warm gray palette** (stone-based, not cool blue-grays)
- **Orange accent** (500 interactive, 600 hover)

## Portal Layout

### App Shell

```
+--------------------------------------------------+
| Logo  |  Breadcrumb: Tenants > team-alpha > Apps  |  [Cmd+K]  [?]  [avatar]  |
+-------+-------------------------------------------+
| Side  |                                           |
| nav   |  Page content                             |
|       |                                           |
| □ Dashboard                                      |
| □ Apps       |  Content area fills remaining     |
| □ Resources  |  space. Scroll here, not on       |
| □ Catalog    |  the shell.                        |
| □ Tenants    |                                    |
| □ Clusters   |                                    |
|       |                                           |
+-------+-------------------------------------------+
```

- **Sidebar**: collapsible (icon-only mode). Tenant selector at top. Navigation grouped by domain.
- **Header**: breadcrumbs (always), command palette trigger (Cmd+K), help button, user avatar with dropdown.
- **Content**: scrollable independently. Never scroll the shell itself.
- **Drawers**: slide from right for quick actions (edit values, view YAML, trigger action). Don't break navigation.

### Tenant Context

The portal is always scoped to a tenant (except platform engineer views). The tenant selector is prominent: top of sidebar or breadcrumb. Switching tenant reloads the view. URL always includes tenant context: `/tenants/{cluster}/{name}/apps`.

For platform engineers who see all tenants: `/tenants` is the landing page. For developers in one tenant: auto-redirect to their tenant's dashboard.

## Page Patterns

### 1. List Page (Apps, Resources, Tenants, Clusters)

```
+-------------------------------------------+
| Page Title                    [+ Create]  |
| Subtitle / description                    |
+-------------------------------------------+
| [Search...]  [Filter: Status v] [Sort v]  |
+-------------------------------------------+
| Name          Status  Cluster  Updated    |
| ─────────────────────────────────────────|
| my-api        ■ Synced  prod   2m ago    |
| my-worker     ■ OutOfSync prod  1h ago   |
| my-cron       ■ Synced  staging 5m ago   |
+-------------------------------------------+
| Showing 3 of 3                [< 1 2 >]  |
+-------------------------------------------+
```

- Table with sortable columns. Monospace for names, timestamps, versions.
- Status squares (8x8px, colored) inline with status text.
- Clickable rows navigate to detail page.
- Search filters client-side for small lists, server-side for large.
- Empty state: illustration + "Deploy your first app" CTA.

### 2. Detail Page (App Detail, Tenant Detail, Resource Detail)

```
+-------------------------------------------+
| ← Back to Apps                            |
| my-api                        [Edit] [⋮]  |
| web-app · prod-cluster-01 · team-alpha    |
+-------------------------------------------+
| [Overview] [YAML] [Events] [History]      |
+-------------------------------------------+
|  ┌─────────┐  ┌─────────┐  ┌─────────┐  |
|  │ Status  │  │ Replicas│  │ Image   │  |
|  │ ■ Synced│  │ 3/3     │  │ v1.4.2  │  |
|  └─────────┘  └─────────┘  └─────────┘  |
|                                           |
|  Recent Activity                          |
|  ● Synced successfully          2m ago    |
|  ● Image updated to v1.4.2     1h ago    |
|  ● Created by portal           3d ago    |
+-------------------------------------------+
```

- Back link (not just browser back, explicit link).
- Resource identity: name (large), metadata line (type, cluster, tenant).
- Action buttons: Edit (opens drawer or page), overflow menu for dangerous actions.
- Tabs for different views of the same resource.
- Summary cards at top, activity feed below.

### 3. Create/Edit Wizard (Tenant Onboarding, App Deploy, Resource Request)

```
+-------------------------------------------+
| Deploy New Application                    |
+-------------------------------------------+
| Step 1        Step 2        Step 3        |
| Template ──── Configure ──── Review       |
|   [active]      [next]       [locked]     |
+-------------------------------------------+
|                                           |
| Pick an app template                      |
|                                           |
| ┌───────────────┐  ┌───────────────┐     |
| │ □ Web App     │  │ □ Worker      │     |
| │ HTTP service  │  │ Background    │     |
| │ with ingress  │  │ processor     │     |
| └───────────────┘  └───────────────┘     |
|                                           |
| ┌───────────────┐  ┌───────────────┐     |
| │ □ Cron Job    │  │ □ Custom      │     |
| │ Scheduled     │  │ Bring your    │     |
| │ tasks         │  │ own chart     │     |
| └───────────────┘  └───────────────┘     |
|                                           |
+-------------------------------------------+
|              [Cancel]     [Next →]        |
+-------------------------------------------+
```

- Multi-step with visible progress (stepper component).
- Template selection: cards with icon, title, description.
- Form step: grouped inputs with labels, validation inline.
- Review step: YAML diff of what will be committed. "This will create apps/my-api.yaml in your GitOps repo."
- Confirm button shows the Git action: "Commit to main".

### 4. Dashboard (Tenant Overview)

```
+-------------------------------------------+
| team-alpha Dashboard                      |
+-------------------------------------------+
| ┌──────────┐ ┌──────────┐ ┌──────────┐  |
| │ 5 Apps   │ │ 3 Synced │ │ 2 Alerts │  |
| │          │ │ 1 OoSync │ │ 0 Crit   │  |
| │          │ │ 1 Unknown│ │          │  |
| └──────────┘ └──────────┘ └──────────┘  |
|                                           |
| Applications               [View all →]  |
| ─────────────────────────────────────    |
| my-api    ■ Synced  v1.4.2   2m ago     |
| my-worker ■ OoSync  v2.1.0   1h ago     |
|                                           |
| Platform Resources          [View all →]  |
| ─────────────────────────────────────    |
| postgres-main  ■ Ready    5d ago         |
| redis-cache    ■ Ready    5d ago         |
|                                           |
| Recent Activity             [View all →]  |
| ─────────────────────────────────────    |
| Deploy: my-api v1.4.2      jan  2m ago   |
| Sync: my-worker failed     bot  1h ago   |
+-------------------------------------------+
```

- Summary cards at top (counts with status breakdown).
- Sections for apps, resources, activity.
- Each section: compact table with "View all" link.
- Activity feed: who did what, when. Git commits as the source.

### 5. Catalog Page (Service Catalog Browser)

```
+-------------------------------------------+
| Service Catalog                           |
+-------------------------------------------+
| [Search catalog...]                       |
| [All] [Apps] [Platform Resources]         |
+-------------------------------------------+
|                                           |
| App Templates                             |
| ┌──────────┐ ┌──────────┐ ┌──────────┐  |
| │ Web App  │ │ Worker   │ │ Cron Job │  |
| │          │ │          │ │          │  |
| │ HTTP svc │ │ Backgrnd │ │ Schedule │  |
| │ w/ ingr  │ │ process  │ │ tasks    │  |
| │ [Deploy] │ │ [Deploy] │ │ [Deploy] │  |
| └──────────┘ └──────────┘ └──────────┘  |
|                                           |
| Platform Resources                        |
| ┌──────────┐ ┌──────────┐ ┌──────────┐  |
| │ Postgres │ │ Redis    │ │ S3 Bucket│  |
| │          │ │          │ │          │  |
| │ Managed  │ │ In-mem   │ │ Object   │  |
| │ database │ │ cache    │ │ storage  │  |
| │ [Request]│ │ [Request]│ │ [Request]│  |
| └──────────┘ └──────────┘ └──────────┘  |
+-------------------------------------------+
```

- Two sections: app templates (from ConfigMap) and platform resources (from XRDs).
- Card grid with icon, name, short description, action button.
- Filter tabs: All, Apps, Platform Resources.
- Search across both sources.
- "Deploy" opens app wizard. "Request" opens resource request form.

### 6. Operations Overview (Aggregated Views)

These pages aggregate operational data across all apps in a tenant:

```
+-------------------------------------------+
| Alerts                        [Silence]   |
+-------------------------------------------+
| ■ 2 Firing  ■ 1 Pending  ■ 0 Silenced   |
+-------------------------------------------+
| Sev  Alert           App      Since       |
| ─────────────────────────────────────────|
| ■    HighErrorRate   my-api    15m        |
| ■    PodRestarting   my-worker 2h         |
| ■    HighLatency     my-api    5m         |
+-------------------------------------------+
```

## Interaction Patterns

### Command Palette (Cmd+K)

Global search across all portal entities. Fuzzy matching. Categories:
- Apps: "my-api", "my-worker"
- Resources: "postgres-main", "redis-cache"
- Catalog: "PostgreSQL", "Web App"
- Tenants: "team-alpha", "team-beta"
- Actions: "Deploy app", "Request resource", "Onboard tenant"
- Navigation: "Dashboard", "Catalog", "Alerts"

Results ranked by relevance. Arrow keys to navigate, Enter to select, Esc to close.

### Toast Notifications

Bottom-right stack. Auto-dismiss after 5s. Types:
- **Success**: "Committed apps/my-api.yaml to main" (green square)
- **Error**: "Failed to commit: merge conflict" (red square, sticky until dismissed)
- **Info**: "Sync in progress for my-api" (blue square)
- **Warning**: "3 apps are out of sync" (yellow square)

### Drawer (Side Panel)

Right-side slide-in panel (400px wide). For:
- Editing app values (form in drawer, saves = Git commit)
- Viewing YAML of any resource
- Quick resource details without leaving the list
- Triggering actions (backup, scale, rollback)

Drawers don't change the URL. Close with Esc or click outside.

### Confirmation Dialogs

For destructive actions only: delete app, delete resource, remove tenant.
Show exactly what will happen: "This will delete apps/my-api.yaml from your GitOps repo and commit to main."
Require typing the resource name for high-risk actions.

### Loading States

- **Navigation**: instant (SvelteKit client-side routing). Show skeleton for data.
- **Data fetch**: skeleton placeholders matching the layout shape. Never spinners for initial load.
- **Actions**: button shows loading state (disabled + "Committing..."). Toast on completion.
- **Real-time**: SSE connection for sync status. Updates flow in without polling.

### Empty States

Every list page has a purposeful empty state:
- **No apps**: "Deploy your first application" + [Browse Catalog] button
- **No resources**: "Request your first platform resource" + [Browse Catalog] button
- **No tenants**: "Onboard your first tenant" + [Create Tenant] button (platform eng only)
- **No alerts**: "All clear. No active alerts." (with a subtle pixel art checkmark)

## Portal Feature Scope

### Tier 1: Core Self-Service (MVP)

These are the portal's reason to exist. Ship these first.

| Feature | Page | Description |
|---------|------|-------------|
| Auth (OIDC via Dex) | `/login`, `/api/v1/auth/*` | Same identity as ArgoCD. SSO. Groups-based access. |
| Tenant dashboard | `/tenants/{c}/{n}` | Apps, resources, sync status, quota usage, team info. |
| Service catalog | `/catalog` | Browse Helm chart templates + Crossplane XRDs. |
| App deployment | `/apps/new` | Wizard: pick template, configure, review YAML, commit. |
| Resource request | `/resources/new` | Wizard: pick XRD, fill form from schema, review, commit. |
| Tenant onboarding | `/tenants/new` | Wizard: name, cluster, quotas, roles, review values.yaml, commit. |
| Team membership | `/tenants/{c}/{n}/membership` | Assign OIDC groups to AppProject roles. |
| App management | `/apps/{ns}/{name}` | View, edit values, scale, delete. YAML view. |

### Tier 2: Aggregated Operations

These bring operational data from extensions into tenant-scoped aggregated views. Extensions show per-resource data inside ArgoCD; the portal shows the big picture.

| Feature | Page | Data Source | Why Portal (not extension) |
|---------|------|-------------|---------------------------|
| Sync overview | Dashboard | ArgoCD API | Cross-app sync status at a glance |
| Alert overview | `/alerts` | Alertmanager API | Cross-app alerts, silence, acknowledge |
| Backup overview | `/backups` | Velero API (via K8s) | Cross-app backup status, trigger restore |
| Metrics overview | Dashboard cards | Prometheus API | Tenant-scoped CPU/memory/request summary |
| Activity feed | Dashboard, `/activity` | Git history (both repos) | Who deployed what, when. Audit trail. |
| Resource status | `/resources` | Crossplane status via K8s | All platform resources, provisioning status |

### Tier 3: Platform Intelligence

Deeper integrations that make the portal indispensable.

| Feature | Page | Data Source | Description |
|---------|------|-------------|-------------|
| CI/CD pipeline status | App detail | GitHub Actions / GitLab CI API | Last build status, duration, linked from app annotations |
| Image info | App detail | Container registry API (Harbor, GHCR) | Current image tag, vulnerabilities, size, layers |
| Cost overview | `/costs` | OpenCost / Kubecost API | Per-tenant, per-app resource cost attribution |
| Environment promotion | App detail action | Git API | Promote image tag from staging to prod (commit to GitOps repo) |
| Rollback | App detail action | Git API | Revert to previous image tag (Git revert commit) |

### Tier 4: Security and Compliance

| Feature | Page | Data Source | Description |
|---------|------|-------------|-------------|
| Policy overview | `/policies` | Kyverno PolicyReports | Cross-app policy violations, compliance score |
| Image scanning | App detail, `/security` | Harbor/Trivy API | Vulnerability summary per deployed image |
| Runtime security | `/security/runtime` | Falco API | Runtime alerts, suspicious activity per tenant |
| Certificate status | `/certificates` | cert-manager via K8s | TLS cert expiry, renewal status |
| Audit log | `/audit` | Git history + K8s events | Comprehensive audit trail of all changes |

### Feature Discovery via Annotations

The portal reads annotations on ArgoCD Applications and K8s resources to discover integrations:

```yaml
# On an ArgoCD Application
metadata:
  annotations:
    argoplane.io/ci-url: "https://github.com/org/repo/actions"
    argoplane.io/registry-url: "harbor.example.com/team-alpha/my-api"
    argoplane.io/grafana-url: "https://grafana.example.com/d/abc123"
    argoplane.io/docs-url: "https://docs.example.com/my-api"
    argoplane.io/runbook-url: "https://wiki.example.com/runbooks/my-api"
```

The portal renders these as contextual links and fetches data from the annotated URLs where APIs exist. No hardcoded integrations. Platform teams annotate what they want visible.

## Component Inventory for Portal

### Must-have shadcn-svelte components

Install these immediately when scaffolding:

```
button, card, table, dialog, select, input, badge,
tabs, breadcrumb, dropdown-menu, command (palette),
form, label, textarea, checkbox, radio-group,
sheet (drawer), separator, skeleton, toast,
tooltip, avatar, progress, alert, collapsible,
pagination, popover, scroll-area, switch
```

### Custom portal components (build on top of shadcn)

| Component | Purpose | Base |
|-----------|---------|------|
| `AppShell` | Sidebar + header + content layout | Custom |
| `TenantSelector` | Dropdown to switch tenant context | `Select` |
| `StatusSquare` | 8x8px colored status indicator | Custom (matches design system) |
| `MetricCard` | Compact value + label + optional sparkline | `Card` |
| `ActivityFeed` | Timeline of Git commits and events | Custom |
| `YamlViewer` | Syntax-highlighted YAML with copy button | Custom + Shiki |
| `YamlDiff` | Side-by-side or inline diff of YAML changes | Custom |
| `CatalogCard` | Service catalog item with icon + description + action | `Card` |
| `WizardStepper` | Multi-step form with progress indicator | Custom |
| `ResourceBadge` | Kind + name in monospace with status square | `Badge` |
| `QuotaBar` | Usage bar showing used/limit (CPU, memory, pods) | `Progress` |
| `EmptyStateCTA` | Centered message with primary action button | Custom |
| `CommandPalette` | Global search overlay (Cmd+K) | `Command` |
| `FilterBar` | Search + filter dropdowns + sort for list pages | Custom |
| `AnnotationBadge` | Shows "Portal-managed" or "User-owned" state | `Badge` |

## Reference Inspiration

Study these for interaction patterns (not visual style, our style is distinct):

- **Vercel Dashboard**: deployment list, real-time build logs, environment variables UI
- **Railway**: service catalog cards, one-click deploy, resource provisioning flow
- **Linear**: command palette, keyboard shortcuts, information density, speed
- **GitHub**: activity feeds, diff views, PR review flow, repository navigation
- **Grafana**: dashboard cards, time range selector, variable selectors

What to take: speed, information density, keyboard-first, real-time updates.
What to leave: their visual styles, rounded corners, shadows, gradients.

## Designing a New Page

When designing a portal page, follow this checklist:

1. **Define the user story**: "As a [persona], I want to [action] so that [outcome]"
2. **Pick the page pattern**: List, Detail, Wizard, Dashboard, or Operations Overview
3. **Sketch the layout**: ASCII wireframe showing all sections, data, and actions
4. **Define the data**: What API endpoints feed this page? What's the loading state?
5. **Define the interactions**: What happens on click, hover, keyboard? Drawers or navigation?
6. **Define the empty state**: What does the user see when there's no data?
7. **Define the error state**: What happens when the API fails?
8. **Define the real-time behavior**: Does anything update live (SSE)?
9. **Map to components**: Which shadcn components + custom components are needed?
10. **Write the route**: SvelteKit route path, layout group, load function

## File Organization

Design specs live alongside the code:

```
services/portal/frontend/
  src/
    lib/
      components/
        app/                    # App-level components
          AppShell.svelte       # Main layout shell
          Sidebar.svelte        # Navigation sidebar
          Header.svelte         # Top header with breadcrumbs
          CommandPalette.svelte # Cmd+K search
          TenantSelector.svelte # Tenant context switcher
        shared/                 # Reusable across pages
          StatusSquare.svelte
          MetricCard.svelte
          ActivityFeed.svelte
          YamlViewer.svelte
          YamlDiff.svelte
          CatalogCard.svelte
          WizardStepper.svelte
          ResourceBadge.svelte
          QuotaBar.svelte
          EmptyStateCTA.svelte
          FilterBar.svelte
          AnnotationBadge.svelte
        ui/                     # shadcn-svelte (auto-generated)
```
