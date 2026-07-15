import { colors } from '@argoplane/shared';

/**
 * Shared chart/series palette for the metrics extension, derived from
 * design-system tokens. Defined once here; charts, pod tables, and legends
 * all cycle through the same colors so a pod keeps its color everywhere.
 */
export const SERIES_COLORS = [
  colors.blueText,
  colors.orange500,
  colors.greenText,
  colors.redText,
  colors.yellowText,
  colors.blueSolid,
  colors.orange600,
  colors.greenSolid,
  colors.gray600,
  colors.redSolid,
  colors.blue,
  colors.orange300,
  colors.green,
  colors.gray400,
  colors.yellow,
];
