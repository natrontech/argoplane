# ArgoPlane Tailwind CSS v4 Theme

This is the exact Tailwind theme configuration that maps ArgoPlane design tokens to Tailwind utilities.

## app.css

```css
@import "tailwindcss";

/* ArgoPlane fonts */
@font-face {
  font-family: "Heebo";
  src: url("https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600&display=swap");
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap");
}

/* ArgoPlane Tailwind v4 theme */
@theme {
  /* Colors: Orange accent */
  --color-orange-50: #FFF7ED;
  --color-orange-100: #FFEDD5;
  --color-orange-200: #FDDCB0;
  --color-orange-300: #F5C28B;
  --color-orange-400: #F0A868;
  --color-orange-500: #E8935A;
  --color-orange-600: #D47A42;

  /* Colors: Warm grays */
  --color-gray-50: #FAFAF9;
  --color-gray-100: #F5F5F4;
  --color-gray-200: #E7E5E4;
  --color-gray-300: #D6D3D1;
  --color-gray-400: #A8A29E;
  --color-gray-500: #78716C;
  --color-gray-600: #57534E;
  --color-gray-700: #44403C;
  --color-gray-800: #292524;
  --color-gray-900: #1C1917;

  /* Colors: Status */
  --color-success-light: #D1FAE5;
  --color-success: #6EE7B7;
  --color-success-text: #16A34A;
  --color-error-light: #FFE4E6;
  --color-error: #FDA4AF;
  --color-error-text: #B91C1C;
  --color-warning-light: #FEF9C3;
  --color-warning: #FDE68A;
  --color-warning-text: #A16207;
  --color-info-light: #DBEAFE;
  --color-info: #93C5FD;
  --color-info-text: #1D4ED8;

  /* Typography */
  --font-body: "Heebo", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;

  /* Spacing (4px grid) */
  --spacing: 4px;

  /* Border radius */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 4px;
  --radius-xl: 4px;

  /* Transitions */
  --transition-fast: 100ms;
  --transition-normal: 150ms;
}

/* Base styles */
body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--color-gray-800);
  background-color: white;
  line-height: 1.5;
}

/* Dark mode */
.dark body,
[data-theme="dark"] body {
  color: var(--color-gray-100);
  background-color: var(--color-gray-900);
}
```

## Key design rules for Tailwind usage

- **Spacing**: Use multiples of the base spacing (4px). `p-1` = 4px, `p-2` = 8px, `p-3` = 12px, `p-4` = 16px, etc.
- **Border radius**: Never exceed `rounded-md` (4px). No `rounded-lg`, `rounded-xl`, `rounded-full`.
- **Borders**: Always 1px solid. Use `border border-gray-200`. Never 2px+ (except table header bottom).
- **No shadows**: Never use `shadow-*` utilities.
- **No gradients**: Never use `bg-gradient-*` utilities.
- **Monospace for data**: All data values, timestamps, resource names use `font-mono`.
- **Max font size**: 20px (`text-xl`). Never use `text-2xl` or larger.
- **Status indicators**: 8x8px colored squares with `rounded-sm` (2px). Not circles.
- **Buttons**: `bg-orange-500 hover:bg-orange-600 text-white rounded-md`
- **Cards**: `border border-gray-200 rounded-md` (no shadow)
- **Inputs**: `border border-gray-200 focus:border-orange-500 rounded-md`
- **Dark mode**: Use Tailwind `dark:` variant. Surface = `dark:bg-gray-800`, text = `dark:text-gray-100`, border = `dark:border-gray-700`, accent = `dark:text-orange-400`
