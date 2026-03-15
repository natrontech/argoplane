# ArgoPlane Style Guide

Open `styleguide.html` in a browser for a live visual reference of all components, tokens, and patterns.

## Design Philosophy

Minimal pixel art meets modern developer tooling. Pastel palette, grid-aligned, intentionally crisp. Every element feels placed on purpose. Not retro gaming, not 8-bit nostalgia: just that satisfying crispness of something perfectly aligned to a 4px grid.

## Tokens

### Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `orange-50` | `#FFF7ED` | Lightest background tint |
| `orange-100` | `#FFEDD5` | Button background (secondary) |
| `orange-200` | `#FDDCB0` | Button border (secondary), hover |
| `orange-300` | `#F5C28B` | Decorative accent |
| `orange-400` | `#F0A868` | Dark theme primary interactive |
| `orange-500` | `#E8935A` | Primary interactive (light theme) |
| `orange-600` | `#D47A42` | Primary button border, text on light bg |
| `gray-50` | `#FAFAF9` | Card background |
| `gray-100` | `#F5F5F4` | Table row border, subtle bg |
| `gray-200` | `#E7E5E4` | Borders, dividers, pixel decoration |
| `gray-300` | `#D6D3D1` | Disabled borders, separators |
| `gray-400` | `#A8A29E` | Muted text, disabled text |
| `gray-500` | `#78716C` | Secondary text, labels |
| `gray-600` | `#57534E` | Body text (dark contexts) |
| `gray-700` | `#44403C` | Dark theme border |
| `gray-800` | `#292524` | Dark theme surface, heading text |
| `gray-900` | `#1C1917` | Dark theme background |
| `green-light` | `#D1FAE5` | Healthy status background |
| `green-solid` | `#86EFAC` | Healthy status badge |
| `red-light` | `#FFE4E6` | Failed status background |
| `red-solid` | `#FCA5A5` | Failed status badge |
| `yellow-light` | `#FEF9C3` | Degraded status background |
| `yellow-solid` | `#FDE047` | Degraded status badge |
| `blue-light` | `#DBEAFE` | In-progress status background |
| `blue-solid` | `#7DD3FC` | In-progress status badge |

### Typography

| Token | Value | Usage |
|-------|-------|-------|
| `font-body` | Heebo, sans-serif | Inherited from ArgoCD |
| `font-mono` | JetBrains Mono, SF Mono, Fira Code, monospace | Data values, code |
| `text-xs` | 11px | Labels, metadata, table headers |
| `text-sm` | 13px | Table cells, secondary text, buttons |
| `text-md` | 14px | Body text |
| `text-lg` | 16px | Section headers |
| `text-xl` | 20px | Metric values, panel titles |

Weights: 400 (normal), 500 (medium), 600 (semibold). Nothing heavier.

### Spacing

4px grid, no exceptions.

| Token | Value |
|-------|-------|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `radius-none` | 0px | Tables, code blocks |
| `radius-sm` | 2px | Buttons, inputs, badges |
| `radius-md` | 4px | Cards, panels |

Always 1px border width. Crisp, single-pixel lines.

## Components

See `styleguide.html` for rendered examples of:

- **Status Badge**: 8x8px colored square + text label
- **Section Header**: Uppercase label + extending line
- **Cards**: Light bg, thin border, no shadow
- **Metric Card**: Monospace value + small label
- **Buttons**: Secondary (pastel fill) and primary (solid fill)
- **Data Table**: Minimal, monospace values, single-pixel borders
- **Meta Row**: Inline key-value pairs with interpunct separator
- **Empty State**: 2x2 pixel grid + muted message
- **Loading**: Three squares cycling sequentially
- **Pixel Decoration**: 2x2 dot cluster for card corners

## Anti-Patterns

- No rounded pills or fully circular elements
- No box shadows (pixel art is flat)
- No gradients
- No animations longer than 150ms
- No font sizes larger than 20px
- No emoji in UI (use pixel squares and symbols)
- No busy patterns or textures
- No alternating row colors in tables
