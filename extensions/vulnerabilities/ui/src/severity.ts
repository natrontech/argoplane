import { colors } from '@argoplane/shared';

// Severity colors built from shared theme tokens. Defined once and reused by
// the badge, filter, and pie chart in every vulnerabilities view.

export const severityColor: Record<string, string> = {
  CRITICAL: colors.redText,
  HIGH: colors.orange500,
  MEDIUM: colors.yellowText,
  LOW: colors.blueText,
  UNKNOWN: colors.gray500,
};

export const severityBg: Record<string, string> = {
  CRITICAL: colors.redLight,
  HIGH: colors.orange100,
  MEDIUM: colors.yellowLight,
  LOW: colors.blueLight,
  UNKNOWN: colors.gray100,
};
