# Portal UX Patterns Reference

## Navigation Architecture

### URL Structure

Every portal page has a clean, bookmarkable URL:

```
/                                           # Landing / login
/dashboard                                  # Auto-redirect to user's primary tenant
/tenants                                    # Tenant list (platform eng)
/tenants/new                                # Onboard tenant wizard
/tenants/{cluster}/{name}                   # Tenant dashboard
/tenants/{cluster}/{name}/membership        # Team membership
/tenants/{cluster}/{name}/apps              # Tenant's apps
/tenants/{cluster}/{name}/apps/new          # Deploy app wizard
/tenants/{cluster}/{name}/apps/{name}       # App detail
/tenants/{cluster}/{name}/resources         # Platform resources
/tenants/{cluster}/{name}/resources/new     # Request resource wizard
/tenants/{cluster}/{name}/resources/{name}  # Resource detail
/tenants/{cluster}/{name}/alerts            # Tenant alerts
/tenants/{cluster}/{name}/backups           # Tenant backups
/tenants/{cluster}/{name}/activity          # Activity feed
/tenants/{cluster}/{name}/settings          # Tenant settings
/catalog                                    # Service catalog (global)
/catalog/charts/{name}                      # Chart template detail
/catalog/xrds/{group}/{kind}               # XRD detail
/clusters                                   # Cluster list
/clusters/{name}                            # Cluster detail
```

### Sidebar Navigation

```
[Tenant Selector: team-alpha ▾]
────────────────────────────
◻ Dashboard
◻ Apps
◻ Resources
◻ Catalog
────────────────────────────
◻ Alerts          (count badge)
◻ Backups
◻ Activity
────────────────────────────
◻ Membership
◻ Settings
────────────────────────────
Platform  (only for platform eng)
◻ Tenants
◻ Clusters
```

Groups: Self-Service (top), Operations (middle), Management (bottom), Platform (admin only).

### Breadcrumb Patterns

```
Dashboard
Tenants > team-alpha > Dashboard
Tenants > team-alpha > Apps
Tenants > team-alpha > Apps > my-api
Tenants > team-alpha > Apps > New
Catalog
Catalog > PostgreSQL (XRD)
```

## Data Display Patterns

### Status Indicators

Always use colored squares (8x8px, 1px border-radius):

| Status | Color | Square | Text |
|--------|-------|--------|------|
| Healthy / Synced / Ready | Green | `■` | "Synced", "Ready", "Healthy" |
| Degraded / Warning / Pending | Yellow | `■` | "Degraded", "Pending", "Warning" |
| Failed / Error / Critical | Red | `■` | "Failed", "Error", "Critical" |
| In Progress / Syncing | Blue | `■` | "Syncing", "Progressing", "Provisioning" |
| Unknown / Missing | Gray | `■` | "Unknown", "N/A" |

### Timestamp Display

All timestamps in monospace, relative by default:
- < 1 minute: "just now"
- < 1 hour: "Xm ago"
- < 24 hours: "Xh ago"
- < 7 days: "Xd ago"
- Otherwise: "Jan 15, 2026" (absolute)

Hover tooltip shows absolute time in ISO 8601.

### Data Tables

- Sortable columns: click header to sort, click again to reverse
- Monospace for: names, versions, image tags, timestamps, IDs, counts
- Body font for: descriptions, display names, labels
- Row click navigates to detail page
- No row selection checkboxes unless bulk actions exist
- Compact variant for nested tables (smaller padding)

### Metric Cards

Summary cards at the top of dashboard pages:

```
┌─────────────┐
│ 5           │  <- value (text-xl, monospace, semibold)
│ Applications│  <- label (text-xs, uppercase, muted)
│ ■3 ■1 ■1   │  <- status breakdown (inline squares)
└─────────────┘
```

## Form Patterns

### Input Fields

- Label above, not inline
- Monospace for technical inputs (image names, repo URLs, resource names)
- Body font for display names, descriptions
- Validation: inline below the field, red text, appears on blur
- Required fields: no asterisk, just validate and show error
- Help text: muted text below label, before input

### Wizard Steps

Each wizard has 3-4 steps:

1. **Select** (template, type, cluster): card grid or list selection
2. **Configure** (values, settings): form fields grouped by section
3. **Review** (YAML preview, summary): read-only, diff view if editing
4. **Confirm** (optional): for high-impact actions, show what will happen

Step indicator: horizontal stepper with step numbers, titles, and connecting lines.
Current step: orange accent. Completed: green checkmark. Future: gray.

### Dynamic Forms from Schemas

For Crossplane XRD claims, generate form fields from OpenAPI schema:

- `string` → text input (monospace)
- `integer` → number input
- `boolean` → toggle switch
- `enum` → select dropdown
- `object` → collapsible section with nested fields
- `array` → repeatable field group with add/remove

For Helm values, generate from values.schema.json if available. Fall back to YAML editor for complex values.

## Real-Time Patterns

### Server-Sent Events (SSE)

The Go backend exposes `/api/v1/events` SSE endpoint. Events:

- `sync-status-changed`: app sync status update
- `resource-status-changed`: Crossplane resource status update
- `alert-fired`: new alert
- `alert-resolved`: alert cleared
- `deploy-completed`: Git commit + ArgoCD sync completed

Frontend subscribes on mount, updates stores reactively. No polling.

### Optimistic Updates

For Git commit operations:
1. User clicks "Deploy"
2. UI immediately shows "Committing..." state on the button
3. Toast: "Committing apps/my-api.yaml..."
4. On success: toast updates to "Committed. Waiting for sync."
5. SSE delivers sync status update
6. UI updates to show new sync status

### Connection Status

Show connection indicator in header:
- Green dot: SSE connected, receiving events
- Yellow dot: reconnecting
- Red dot: disconnected (show banner: "Real-time updates unavailable")

## Responsive Behavior

The portal targets desktop-first (1280px+). Responsive down to 768px.

- **< 768px**: sidebar collapses to hamburger menu. Tables become card lists.
- **768px - 1024px**: sidebar in icon-only mode. Tables remain but columns reduce.
- **1024px+**: full sidebar. Full tables. Drawers at 400px.
- **1280px+**: optimal layout. Content area max-width 1200px, centered.

## Accessibility

- All interactive elements focusable via Tab
- Aria labels on icon-only buttons
- Status squares have aria-label with status text
- Color is never the only indicator (always paired with text)
- Focus visible outline (2px orange)
- Skip navigation link
- Landmarks: nav, main, aside
- Reduced motion: respect `prefers-reduced-motion`

## Error Handling

### API Errors

- **401**: redirect to login
- **403**: show "You don't have access to this tenant" with explanation
- **404**: show "Not found" with breadcrumb back to parent
- **409**: show "Conflict: resource was modified" with refresh option
- **500**: show "Something went wrong" with retry button and error ID

### Git Commit Failures

- **Merge conflict**: "Someone else modified this file. Please review and try again." Show diff.
- **Auth failure**: "Git authentication failed. Contact your platform team."
- **Repo not found**: "GitOps repository not found. Check tenant configuration."

### Network Errors

- **Offline**: banner at top "You're offline. Changes won't be saved."
- **Timeout**: toast with retry option
- **SSE disconnect**: auto-reconnect with exponential backoff. Show indicator.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `Esc` | Close drawer / dialog / palette |
| `g d` | Go to dashboard |
| `g a` | Go to apps |
| `g r` | Go to resources |
| `g c` | Go to catalog |
| `n a` | New app |
| `n r` | New resource |
| `?` | Show keyboard shortcuts |

Vim-style two-key combos for navigation. Show hint in footer or help dialog.
