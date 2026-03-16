import * as React from 'react';
import { colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { TimeRange } from '../types';

const durations: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

export const DurationSelector: React.FC<{
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}> = ({ value, onChange }) => (
  <div style={container}>
    {durations.map((d) => (
      <button
        key={d.value}
        onClick={() => onChange(d.value)}
        style={d.value === value ? activeLink : link}
      >
        {d.label}
      </button>
    ))}
  </div>
);

const container: React.CSSProperties = {
  display: 'flex',
  gap: spacing[1],
  alignItems: 'center',
};

const link: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: `${spacing[1]}px ${spacing[1]}px`,
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
  color: colors.gray400,
  cursor: 'pointer',
  textTransform: 'uppercase',
  textDecoration: 'none',
};

const activeLink: React.CSSProperties = {
  ...link,
  color: colors.orange600,
  fontWeight: 600,
  textDecoration: 'overline',
};
