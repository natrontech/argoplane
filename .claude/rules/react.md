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

### Available Registration Methods

- `registerResourceExtension(component, group, kind, title, opts?)` - resource detail tabs
- `registerSystemLevelExtension(component, title, options?)` - sidebar pages
- `registerStatusPanelExtension(component, title, id, flyout?)` - app status bar items
- `registerTopBarActionMenuExt(component, title, id, flyout?, shouldDisplay?, icon?, isMiddle?)` - action buttons
- `registerAppViewExtension(component, title, icon, shouldDisplay?)` - app detail views

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
