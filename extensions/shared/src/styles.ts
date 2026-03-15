import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, radius, spacing } from './theme';

// --- Status ---

export type Status = 'healthy' | 'degraded' | 'failed' | 'in-progress' | 'unknown';

const statusColors: Record<Status, string> = {
  'healthy': colors.greenSolid,
  'degraded': colors.yellowSolid,
  'failed': colors.redSolid,
  'in-progress': colors.blueSolid,
  'unknown': colors.gray300,
};

const statusBgColors: Record<Status, string> = {
  'healthy': colors.greenLight,
  'degraded': colors.yellowLight,
  'failed': colors.redLight,
  'in-progress': colors.blueLight,
  'unknown': colors.gray100,
};

export function statusColor(status: Status): string {
  return statusColors[status] || colors.gray300;
}

export function statusBg(status: Status): string {
  return statusBgColors[status] || colors.gray100;
}

// --- Layout ---

export const panel: React.CSSProperties = {
  padding: spacing[5],
  fontFamily: 'inherit',
};

export const card: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: spacing[4],
};

// --- Section Header ---
// "BACKUPS ─────────"

export const sectionHeader: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.gray500,
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  marginBottom: spacing[5],
};

export const sectionLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: colors.gray200,
};

// --- Tables ---

export const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  borderSpacing: 0,
};

export const th: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.gray500,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderBottom: `2px solid ${colors.gray200}`,
  textAlign: 'left',
};

export const td: React.CSSProperties = {
  fontSize: fontSize.sm,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderBottom: `1px solid ${colors.gray100}`,
  fontFamily: fonts.mono,
};

export const tdLast: React.CSSProperties = {
  ...td,
  borderBottom: 'none',
};

// --- Buttons ---

export const button: React.CSSProperties = {
  background: colors.orange100,
  color: colors.orange600,
  border: `1px solid ${colors.orange200}`,
  borderRadius: radius.sm,
  padding: `6px ${spacing[3]}px`,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.1s',
};

export const buttonPrimary: React.CSSProperties = {
  ...button,
  background: colors.orange500,
  color: colors.white,
  border: `1px solid ${colors.orange600}`,
};

export const buttonDisabled: React.CSSProperties = {
  ...button,
  background: colors.gray100,
  color: colors.gray400,
  border: `1px solid ${colors.gray200}`,
  cursor: 'not-allowed',
};

export const buttonDanger: React.CSSProperties = {
  ...button,
  background: colors.redLight,
  color: '#B91C1C',
  border: `1px solid ${colors.red}`,
};

// --- Metric Card ---

export const metricCard: React.CSSProperties = {
  ...card,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[1],
  minWidth: 120,
  position: 'relative',
};

export const metricValue: React.CSSProperties = {
  fontSize: fontSize.xl,
  fontWeight: fontWeight.semibold,
  fontFamily: fonts.mono,
  color: colors.gray800,
  lineHeight: 1,
};

export const metricLabel: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
  color: colors.gray500,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

export const metricUnit: React.CSSProperties = {
  fontSize: 12,
  fontWeight: fontWeight.normal,
  color: colors.gray400,
  fontFamily: fonts.mono,
};

// --- Status Badge ---
// 8x8 square + text

export const badge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
};

export const badgeSquare = (status: Status): React.CSSProperties => ({
  width: 8,
  height: 8,
  background: statusColor(status),
  borderRadius: 1,
  flexShrink: 0,
});

export const badgeWithBg = (status: Status): React.CSSProperties => ({
  ...badge,
  background: statusBg(status),
  padding: '4px 10px',
  borderRadius: radius.sm,
});

// --- Inline Metadata ---
// "Namespace: default  ·  Last backup: 2h ago"

export const metaRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  fontSize: fontSize.sm,
  color: colors.gray500,
  fontFamily: fonts.mono,
};

export const metaSeparator: React.CSSProperties = {
  color: colors.gray300,
};

// --- Empty State ---

export const emptyState: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: spacing[10],
  gap: spacing[3],
};

export const emptyIcon: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '6px 6px',
  gap: 2,
};

export const emptyPixel: React.CSSProperties = {
  width: 6,
  height: 6,
  background: colors.gray200,
  borderRadius: 1,
};

export const emptyText: React.CSSProperties = {
  fontSize: fontSize.sm,
  color: colors.gray400,
};

// --- Loading ---
// Three squares animating

export const loadingContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing[1],
  padding: spacing[5],
};

export const loadingSquare = (active: boolean): React.CSSProperties => ({
  width: 8,
  height: 8,
  background: active ? colors.orange400 : colors.gray200,
  borderRadius: 1,
  transition: 'background 0.15s',
});

// --- Pixel Decoration ---
// Subtle 2x2 dots for card corners

export const pixelDots: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '3px 3px',
  gap: 2,
  position: 'absolute',
  top: spacing[2],
  right: spacing[2],
};

export const pixelDot: React.CSSProperties = {
  width: 3,
  height: 3,
  background: colors.gray200,
  borderRadius: 0,
};

// --- Tags / Chips ---

export type TagVariant = 'orange' | 'green' | 'red' | 'gray';

const tagVariants: Record<TagVariant, React.CSSProperties> = {
  orange: {
    background: colors.orange50,
    color: colors.orange600,
    borderColor: colors.orange200,
  },
  green: {
    background: colors.greenLight,
    color: '#16A34A',
    borderColor: colors.green,
  },
  red: {
    background: colors.redLight,
    color: '#B91C1C',
    borderColor: colors.red,
  },
  gray: {
    background: colors.gray100,
    color: colors.gray600,
    borderColor: colors.gray200,
  },
};

export const tag = (variant: TagVariant): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  padding: '2px 8px',
  borderRadius: radius.sm,
  borderWidth: 1,
  borderStyle: 'solid',
  ...tagVariants[variant],
});

// --- Input ---

export const input: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  padding: '6px 12px',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  background: colors.white,
  color: colors.gray800,
  outline: 'none',
  transition: 'border-color 0.1s',
};

// --- Progress Bar ---

export const progress: React.CSSProperties = {
  height: 4,
  background: colors.gray100,
  borderRadius: 0,
  overflow: 'hidden',
};

export const progressFill = (percent: number): React.CSSProperties => ({
  height: '100%',
  width: `${Math.min(100, Math.max(0, percent))}%`,
  background: colors.orange400,
  transition: 'width 0.15s',
});

// --- Tooltip ---

export const tooltipWrapper: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block',
};

export const tooltip: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 4px)',
  left: '50%',
  transform: 'translateX(-50%)',
  background: colors.gray800,
  color: colors.gray100,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  padding: '4px 8px',
  borderRadius: radius.sm,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};
