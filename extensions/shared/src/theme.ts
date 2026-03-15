// ArgoPlane Design Tokens
// TypeScript re-export of values from design-system/tokens.css.
// Keep in sync with the canonical CSS custom properties.
// Pastel palette with minimal pixel art influence.

export const colors = {
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
