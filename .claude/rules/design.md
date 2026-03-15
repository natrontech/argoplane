# Design System

## Source of Truth

The visual design system is defined in two files:
- `docs/design-system.md`: full token reference and component specs
- `docs/styleguide.html`: live visual reference (open in browser)

All UI extension code must match these specifications. When in doubt, the HTML reference is authoritative.

## Token Usage

Always use design tokens from `@argoplane/shared` (theme.ts). Never hardcode colors, spacing, or font sizes.

```typescript
import { colors, fonts, spacing, radius, fontSize, fontWeight } from '@argoplane/shared';
```

## Key Rules

- **4px grid**: all spacing must be a multiple of 4px. Use the `spacing` object.
- **1px borders**: always `1px solid`. Never 2px except for table header bottom borders.
- **No rounded pills**: max border-radius is 4px (radius.md). No fully circular elements.
- **No shadows**: pixel art is flat. No box-shadow.
- **No gradients**: flat colors only.
- **No animations > 150ms**: keep transitions snappy. Loading animation is the only exception (cycling squares).
- **No font sizes > 20px**: the largest text is metric values at 20px.
- **No emoji in UI**: use pixel-style squares and symbols from the component library.
- **Monospace for data**: all data values, timestamps, resource names, and code use JetBrains Mono.
- **Status = colored squares**: 8x8px squares with 1px border-radius. Not circles. This is the signature element.

## Component Library

Use pre-built components from `@argoplane/shared` instead of building custom elements:
- StatusBadge, SectionHeader, MetricCard, Card
- Button (secondary/primary/disabled)
- DataTable + Cell
- MetaRow (inline key-value with interpunct separators)
- EmptyState, Loading
- Tag (orange/green/red/gray chips)
- ProgressBar
- Input

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

ArgoCD has a dark theme. Extensions should support it:
- Cards: gray-800 background, gray-700 borders
- Text: gray-100 primary, gray-400 secondary
- Orange accent: use orange-400 instead of orange-500
- Status squares remain the same (pop naturally against dark)
