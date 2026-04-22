# React / TypeScript Conventions (ArgoCD UI Extensions)

## Constraint

ArgoCD extensions run inside ArgoCD's React runtime. React is provided globally by ArgoCD. Do not bundle React. Configure webpack/vite externals:

```javascript
externals: { react: "React", "react-dom": "ReactDOM" }
```

## Extension Registration

Every extension entry point registers via `window.extensionsAPI`:

```typescript
((window: any) => {
  window.extensionsAPI.registerResourceExtension(
    MyComponent,
    'apps',           // Kubernetes API group ('' for core)
    'Deployment',     // Kubernetes resource kind
    'Metrics',        // Tab title
    { icon: 'fa-chart-line' }
  );
})(window);
```

### Available Registration Methods (ArgoCD v3.x)

- `registerResourceExtension(component, group, kind, title, opts?)` - resource detail tabs
- `registerSystemLevelExtension(component, title, options)` - sidebar pages (`options.icon` for FontAwesome class)
- `registerStatusPanelExtension(component, title, id, flyout?)` - app status bar items
- `registerTopBarActionMenuExt(component, title, id, flyout?, shouldDisplay?, iconClassName?, isMiddle?)` - action buttons in top toolbar
- `registerAppViewExtension(component, title, icon, shouldDisplay?)` - app detail views (supports `shouldDisplay` callback since v3.2)

### When to Use Each Registration Type

| Type | Use for | Example |
|------|---------|---------|
| Resource tab | Per-resource operational data | Metrics for a Deployment, flows for a Pod |
| App view | Per-app operational views | All backups for this app, all network flows |
| Status panel | Health at a glance in app header | CPU/memory summary, backup status, flow stats |
| System-level | Cross-app dashboards (sidebar page) | ArgoPlane Overview, Alerts Dashboard |
| Top bar action | Global action buttons | Cluster health summary, external links |

### System-Level Extensions

System-level extensions add sidebar pages. Use them for aggregated, cross-app views:

```typescript
window.extensionsAPI.registerSystemLevelExtension(
  OverviewComponent,
  'ArgoPlane',
  { icon: 'fa-th-large' }
);
```

Good for: cluster health dashboards, cross-app alert views, backup overview, network policy matrix.
Not good for: service catalogs, multi-step forms, team management. ArgoCD's extension system is too constrained for those kinds of flows.

### Top Bar Action Menu

Action buttons with optional flyout panels:

```typescript
window.extensionsAPI.registerTopBarActionMenuExt(
  ClusterHealthComponent,
  'Cluster Health',
  'cluster-health',
  undefined,          // flyout (optional)
  () => true,         // shouldDisplay
  'fa-heart-pulse',
  false               // isMiddle
);
```

## Component Props

Resource extensions receive typed props:

```typescript
interface ExtensionProps {
  resource: any;      // Full Kubernetes resource object
  tree: any;          // Resource tree (parent/child relationships)
  application: any;   // ArgoCD Application object
}
```

Status panel extensions receive `openFlyout()` in props for sliding panels.

System-level extensions receive no resource-specific props (they're global pages).

## File Structure

```
extensions/<name>/ui/
  src/
    index.tsx          # Entry point, registers extension
    components/        # React components
    hooks/             # Custom React hooks
    types.ts           # TypeScript type definitions
    api.ts             # Fetch calls to proxy extension backend
  package.json
  tsconfig.json
  webpack.config.js    # or vite.config.ts
  dist/
    extension.js       # Built bundle (IIFE/UMD, not ES modules)
```

## Proxy API Calls

Extensions call their backend through ArgoCD's proxy:

```typescript
const response = await fetch(
  `/extensions/metrics/api/v1/query?query=${encodeURIComponent(query)}`,
  {
    headers: {
      'Argocd-Application-Name': `${namespace}:${appName}`,
      'Argocd-Project-Name': project,
    },
  }
);
```

The `argocd.token` cookie is sent automatically. ArgoCD validates auth before proxying.

## Naming

- **Components**: PascalCase (`MetricsPanel.tsx`, `BackupList.tsx`)
- **Hooks**: `use` prefix (`useMetrics.ts`, `useBackups.ts`)
- **Utilities**: camelCase (`formatBytes.ts`, `parseLabels.ts`)
- **Types**: PascalCase, no `I` prefix (`BackupStatus`, `MetricQuery`)

## Styling

Use inline styles or CSS modules. ArgoCD does not expose Tailwind. Keep styling minimal; match ArgoCD's existing look and feel where possible.

## TypeScript

- Strict mode enabled
- No `any` except for ArgoCD extension API types (which are untyped)
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for literal types

## Build Output

Extensions must produce a single JS file matching `extension(.*)\.js` pattern, placed in `/tmp/extensions/` inside the argocd-server pod. Build as IIFE or UMD, not ES modules.

## Dependencies

Keep extension bundles small. Don't pull in heavy chart libraries unless necessary. Prefer lightweight alternatives. ArgoCD's React version is the one you get; don't try to use a different version.
