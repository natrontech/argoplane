# Design System

## Source of Truth

The design system lives in `design-system/` at the repo root:
- `design-system/tokens.css`: all CSS custom properties (colors, typography, spacing, borders, semantic aliases, dark theme)
- `design-system/base.css`: reset and element defaults
- `design-system/components.css`: `.ap-*` component classes
- `design-system/utilities.css`: layout, spacing, and typography helpers
- `design-system/argoplane.css`: single import that includes everything

The multi-page reference at `docs/styleguide/` is the visual authority. Open `docs/styleguide/index.html` in a browser.

## Usage by Surface

**ArgoCD extensions (React)**: import from `@argoplane/shared` which re-exports tokens as TypeScript constants and React components. The shared package mirrors `design-system/tokens.css` values.

```typescript
import { colors, fonts, spacing, StatusBadge, Button, Card } from '@argoplane/shared';
```

**Portal, docs, landing page (HTML/CSS)**: import the CSS directly.

```html
<link rel="stylesheet" href="design-system/argoplane.css">
```

Or import individual layers for smaller bundles (tokens.css is always required).

## Token Naming

All CSS custom properties use the `--ap-` prefix. All CSS classes use the `ap-` prefix. Use semantic tokens (`--ap-color-text`, `--ap-color-surface`, `--ap-color-accent`) over raw color tokens where possible; they adapt automatically for dark theme.

## Key Rules

- **4px grid**: all spacing must be a multiple of 4px. Use `--ap-space-*` tokens.
- **1px borders**: always `1px solid`. Never 2px except for table header bottom borders.
- **Max border-radius 4px**: no rounded pills, no circles. Use `--ap-radius-sm` (2px) or `--ap-radius-md` (4px).
- **No shadows**: pixel art is flat. No box-shadow.
- **No gradients**: flat colors only.
- **No animations > 150ms**: keep transitions snappy. Loading animation is the only exception.
- **No font sizes > 20px**: the largest text is metric values at 20px.
- **No emoji in UI**: use pixel-style squares and symbols from the component library.
- **Monospace for data**: all data values, timestamps, resource names, and code use JetBrains Mono.
- **Status = colored squares**: 8x8px squares with 1px border-radius. Not circles.
- **No hardcoded colors**: always use tokens, never hex values in component code.

## Component Library (CSS)

These `.ap-*` classes are available in `design-system/components.css`:

**Data display**: `ap-badge`, `ap-tag`, `ap-metric`, `ap-kv`, `ap-meta`, `ap-count`, `ap-table`, `ap-progress`
**Containers**: `ap-card`, `ap-modal`, `ap-alert`
**Navigation**: `ap-tabs`, `ap-breadcrumb`, `ap-sidenav`
**Form elements**: `ap-btn`, `ap-input`, `ap-select`, `ap-textarea`, `ap-toggle`, `ap-label`
**Feedback**: `ap-loading`, `ap-empty`, `ap-skeleton`, `ap-tooltip`
**Decoration**: `ap-pixels`, `ap-divider`, `ap-avatar`, `ap-section-header`

## Component Library (React)

These components are available from `@argoplane/shared`:

StatusBadge, SectionHeader, MetricCard, Card, Button, DataTable, Cell, MetaRow, EmptyState, Loading, Tag, ProgressBar, Input, PixelDots

## Color Semantics

- **Orange (500/600)**: primary interactive, buttons, accents
- **Green**: healthy/success status
- **Red**: failed/error status
- **Yellow**: degraded/warning status
- **Blue**: in-progress/info status
- **Gray-500**: secondary text, labels
- **Gray-800**: heading text, primary text
- **Gray-200**: borders, dividers, decorative pixels

## Dark Theme

Add `data-theme="dark"` or class `theme-dark` to any parent element. Semantic tokens switch automatically:
- Surface: gray-800, borders: gray-700
- Text: gray-100 primary, gray-400 secondary
- Orange accent: orange-400 instead of orange-500
- Status squares remain the same (pop naturally against dark)

## Self-Service Portal (SvelteKit)

The self-service portal is built with **SvelteKit + Tailwind CSS + shadcn-svelte**. All portal UI must use shadcn-svelte components styled to match the ArgoPlane design system.

### Stack

- **SvelteKit**: app framework (SSR, routing, API routes)
- **Tailwind CSS v4**: utility-first styling
- **shadcn-svelte**: headless component primitives (Button, Dialog, Table, Select, etc.)

### Tailwind Configuration

Extend the Tailwind theme to match ArgoPlane tokens:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        orange: {
          50: '#FFF7ED', 100: '#FFEDD5', 200: '#FDDCB0',
          300: '#F5C28B', 400: '#F0A868', 500: '#E8935A', 600: '#D47A42',
        },
        gray: {
          50: '#FAFAF9', 100: '#F5F5F4', 200: '#E7E5E4', 300: '#D6D3D1',
          400: '#A8A29E', 500: '#78716C', 600: '#57534E', 700: '#44403C',
          800: '#292524', 900: '#1C1917',
        },
      },
      fontFamily: {
        body: ['Heebo', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: '2px',
        md: '4px',
      },
      spacing: {
        // 4px grid: 1=4px, 2=8px, 3=12px, etc.
      },
    },
  },
};
```

### shadcn-svelte Customization

Override shadcn-svelte's default styles to match ArgoPlane:

- **Buttons**: `bg-orange-500 hover:bg-orange-600`, no rounded-full, max `rounded-[4px]`
- **Cards**: `border border-gray-200 rounded-[4px]`, no shadow
- **Inputs**: `border-gray-200 focus:border-orange-500 rounded-[4px]`
- **Tables**: `border-collapse`, 1px borders, monospace for data cells
- **Dialogs/Modals**: `rounded-[4px]`, no shadow, 1px border
- **Status indicators**: 8x8px colored squares, not circles or dots

### Rules for Portal Code

- Always use shadcn-svelte components as the base. Never build custom components when shadcn-svelte has one.
- Style exclusively with Tailwind utility classes. No inline styles, no CSS modules, no `<style>` blocks.
- Follow the same design rules: 4px grid, 1px borders, max 4px radius, no shadows, no gradients, monospace for data.
- Use semantic color names from the extended Tailwind config, not raw hex values.
- Dark mode: use Tailwind's `dark:` variant. Map to the same semantic colors as the CSS design system.
