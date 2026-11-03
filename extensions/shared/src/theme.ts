// ArgoPlane Design Tokens
// TypeScript re-export of values from design-system/tokens.css.
// Keep in sync with the canonical CSS custom properties.
// Pastel palette with minimal pixel art influence.

// Light values, mirroring design-system/tokens.css.
const light = {
  // Primary accent (pastel orange)
  orange50: '#FFF7ED',
  orange100: '#FFEDD5',
  orange200: '#FDDCB0',
  orange300: '#F5C28B',
  orange400: '#F0A868',
  orange500: '#E8935A',
  orange600: '#D47A42',

  // Status: green
  greenLight: '#D1FAE5',
  green: '#6EE7B7',
  greenSolid: '#86EFAC',
  greenText: '#16A34A',

  // Status: red
  redLight: '#FFE4E6',
  red: '#FDA4AF',
  redSolid: '#FCA5A5',
  redText: '#B91C1C',

  // Status: yellow
  yellowLight: '#FEF9C3',
  yellow: '#FDE68A',
  yellowSolid: '#FDE047',
  yellowText: '#A16207',

  // Status: blue
  blueLight: '#DBEAFE',
  blue: '#93C5FD',
  blueSolid: '#7DD3FC',
  blueText: '#1D4ED8',

  // Warm grays
  gray50: '#FAFAF9',
  gray100: '#F5F5F4',
  gray200: '#E7E5E4',
  gray300: '#D6D3D1',
  gray400: '#A8A29E',
  gray500: '#78716C',
  gray600: '#57534E',
  gray700: '#44403C',
  gray800: '#292524',
  gray900: '#1C1917',

  white: '#FFFFFF',
};

type ColorName = keyof typeof light;

// Dark values, applied under ArgoCD's `.theme-dark` class. The gray scale
// inverts, so every key keeps its role: gray800 is primary text, gray200 a
// border, white the field background. This matches the semantic dark tokens
// in tokens.css. Status squares (*Solid) and pastel borders stay as they are.
const dark: Partial<Record<ColorName, string>> = {
  orange50: '#2E2118',
  orange100: '#3D2B1D',
  orange200: '#5C3F28',
  orange300: '#D47A42',
  orange400: '#E8935A',
  orange500: '#F0A868',
  orange600: '#F5C28B',

  greenLight: '#052E16',
  greenText: '#4ADE80',
  redLight: '#450A0A',
  redText: '#F87171',
  yellowLight: '#422006',
  yellowText: '#FACC15',
  blueLight: '#172554',
  blueText: '#60A5FA',

  gray50: '#292524',
  gray100: '#36322F',
  gray200: '#44403C',
  gray300: '#57534E',
  gray400: '#78716C',
  gray500: '#A8A29E',
  gray600: '#D6D3D1',
  gray700: '#E7E5E4',
  gray800: '#F5F5F4',
  gray900: '#FAFAF9',

  white: '#1C1917',
};

// Each color is a CSS custom property, so inline styles and SVG fills follow
// the ArgoCD theme without a re-render. The names are prefixed `--ap-ext-` so
// they never clash with the `--ap-*` tokens in argoplane-styles.css.
export const colors = {} as Record<ColorName, string>;
for (const name of Object.keys(light) as ColorName[]) {
  colors[name] = `var(--ap-ext-${name})`;
}

const decls = (values: Partial<Record<ColorName, string>>) =>
  Object.entries(values).map(([name, value]) => `--ap-ext-${name}:${value};`).join('');

// Every bundle carries this module; the id makes the first one win.
const STYLE_ID = 'argoplane-color-tokens';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `:root{${decls(light)}}.theme-dark,[data-theme="dark"]{${decls(dark)}}`;
  document.head.appendChild(style);
}

export const fonts = {
  body: "'Heebo', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 20,
};

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
};

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
};

export const radius = {
  none: 0,
  sm: 2,
  md: 4,
};
