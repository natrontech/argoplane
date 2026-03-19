import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing, radius } from '@argoplane/shared';
import { ViewMode } from '../types';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ value, onChange }) => {
  return (
    <div style={container}>
      <button
        style={value === 'pod' ? btnActive : btn}
        onClick={() => onChange('pod')}
      >
        By Pod
      </button>
      <button
        style={value === 'container' ? btnActive : btn}
        onClick={() => onChange('container')}
      >
        By Container
      </button>
    </div>
  );
};

const container: React.CSSProperties = {
  display: 'inline-flex',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  overflow: 'hidden',
};

const btn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: `${spacing[1]}px ${spacing[3]}px`,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  fontWeight: fontWeight.medium,
  color: colors.gray500,
  cursor: 'pointer',
  letterSpacing: '0.3px',
};

const btnActive: React.CSSProperties = {
  ...btn,
  background: colors.orange500,
  color: colors.white,
};
