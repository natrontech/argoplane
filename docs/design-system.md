# ArgoPlane Design System

## Philosophy

Minimal pixel art meets modern developer tooling. Crisp, intentional, grid-aligned. Every element feels like it was placed on purpose. Pastel palette keeps things soft and approachable while pixel-sharp edges add character.

Not retro gaming. Not 8-bit nostalgia. Just that satisfying crispness of something perfectly aligned to a grid.

## Color Palette

### Primary Accent (Pastel Orange)

```
--ap-orange-50:  #FFF7ED
--ap-orange-100: #FFEDD5
--ap-orange-200: #FDDCB0
--ap-orange-300: #F5C28B
--ap-orange-400: #F0A868
--ap-orange-500: #E8935A   ← primary interactive
--ap-orange-600: #D47A42
```

### Pastel Status Colors

```
--ap-green-light:  #D1FAE5   background
--ap-green:        #6EE7B7   text/icon
--ap-green-solid:  #86EFAC   badges

--ap-red-light:    #FFE4E6   background
--ap-red:          #FDA4AF   text/icon
--ap-red-solid:    #FCA5A5   badges

--ap-yellow-light: #FEF9C3   background
--ap-yellow:       #FDE68A   text/icon
--ap-yellow-solid: #FDE047   badges

--ap-blue-light:   #DBEAFE   background
--ap-blue:         #93C5FD   text/icon
--ap-blue-solid:   #7DD3FC   badges
```

### Neutrals (Warm Gray)

```
--ap-gray-50:  #FAFAF9
--ap-gray-100: #F5F5F4
--ap-gray-200: #E7E5E4
--ap-gray-300: #D6D3D1
--ap-gray-400: #A8A29E
--ap-gray-500: #78716C
--ap-gray-600: #57534E
--ap-gray-700: #44403C
--ap-gray-800: #292524
--ap-gray-900: #1C1917
```

### Dark Theme Variants

```
--ap-dark-bg:      #1C1917
--ap-dark-surface: #292524
--ap-dark-border:  #44403C
--ap-dark-text:    #F5F5F4
--ap-dark-muted:   #A8A29E
```

## Typography

### Font Stack

Use ArgoCD's Heebo for body text (we're inside their UI). For data values and code, use a monospace font to reinforce the grid/pixel feel.

```
--ap-font-body: 'Heebo', sans-serif       (inherited from ArgoCD)
--ap-font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace
```

### Scale

```
--ap-text-xs:  11px    labels, metadata
--ap-text-sm:  13px    table cells, secondary text
--ap-text-md:  14px    body text
--ap-text-lg:  16px    section headers
--ap-text-xl:  20px    panel titles
```

Font weights: 400 (normal), 500 (medium), 600 (semibold). Nothing heavier.

## Spacing

Everything on a 4px grid. No exceptions.

```
--ap-space-1:  4px
--ap-space-2:  8px
--ap-space-3:  12px
--ap-space-4:  16px
--ap-space-5:  20px
--ap-space-6:  24px
--ap-space-8:  32px
--ap-space-10: 40px
```

## Borders & Corners

Pixel art influence: sharp or barely rounded. Never fully rounded (no pills, no circles except status dots).

```
--ap-radius-none: 0px        tables, code blocks
--ap-radius-sm:   2px        buttons, inputs, badges
--ap-radius-md:   4px        cards, panels
```

Border width is always 1px. Crisp, single-pixel lines.

```
--ap-border: 1px solid var(--ap-gray-200)
--ap-border-dark: 1px solid var(--ap-dark-border)
```

## Components

### Cards

Subtle containers for grouping information. Light background, thin border, no shadow.

```css
.ap-card {
  background: var(--ap-gray-50);
  border: 1px solid var(--ap-gray-200);
  border-radius: 4px;
  padding: 16px;
}
```

### Status Badge

Small, pastel, pixel-crisp. A tiny colored square (not a circle) before the text.

```
[■] Healthy     → green square + text
[■] Degraded    → yellow square + text
[■] Failed      → red square + text
[■] In Progress → blue square + text
[■] Unknown     → gray square + text
```

The square is 8x8px, perfectly aligned. This is the pixel art signature element.

### Buttons

Flat, pastel fill, 2px radius. No shadows, no gradients.

```css
.ap-button {
  background: var(--ap-orange-100);
  color: var(--ap-orange-600);
  border: 1px solid var(--ap-orange-200);
  border-radius: 2px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s;
}

.ap-button:hover {
  background: var(--ap-orange-200);
}

.ap-button-primary {
  background: var(--ap-orange-500);
  color: white;
  border: 1px solid var(--ap-orange-600);
}
```

### Tables

Minimal. No alternating row colors. Single-pixel bottom borders. Monospace values.

```css
.ap-table th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ap-gray-500);
  padding: 8px 12px;
  border-bottom: 2px solid var(--ap-gray-200);
  text-align: left;
}

.ap-table td {
  font-size: 13px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ap-gray-100);
  font-family: var(--ap-font-mono);
}
```

### Metric Cards

Small cards showing a single value. Value in monospace, label below in small text.

```
┌─────────────┐
│  12.5m      │  ← monospace, large, orange accent
│  CPU Usage  │  ← small gray label
└─────────────┘
```

### Section Headers

Minimal. Small uppercase label with a single-pixel line extending to the right.

```
BACKUPS ─────────────────────────
```

### Empty States

Centered, muted text. A small pixel-art style icon (4x4 or 8x8 grid squares) above the message.

```
    ░░
    ░░

  No backups found
```

### Loading State

Instead of a spinner, use a small pixel-art style progress indicator: three squares that animate sequentially.

```
[■] [□] [□]  →  [□] [■] [□]  →  [□] [□] [■]
```

## Patterns

### Pixel Grid Decoration

Subtle decorative element: a small cluster of 2x2px dots in the corner of cards or panels. Very faint (use gray-200). Not on every element, just on feature panels.

```
··
··
```

### Data Density

Show information compactly. Prefer inline key-value pairs over vertical lists when there are few items.

```
Namespace: default  ·  Last backup: 2h ago  ·  Status: ■ Healthy
```

Use the interpunct (·) as a separator. Feels cleaner than pipes or slashes.

## Dark Theme

Same structure, inverted. Pastel colors become slightly more saturated against dark backgrounds to maintain contrast.

- Cards: dark-surface background, dark-border borders
- Text: gray-100 primary, gray-400 secondary
- Status squares: same colors, they pop naturally against dark
- Orange accent: use orange-400 instead of orange-500 for better contrast

## Anti-Patterns

- No rounded pills or fully circular elements (except status dot fallback)
- No box shadows (pixel art is flat)
- No gradients
- No animations longer than 150ms
- No font sizes larger than 20px
- No emoji in the UI (use pixel-style squares and symbols instead)
- No busy patterns or textures
