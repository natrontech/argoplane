import * as React from 'react';
import { colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { Severity, TimeSelection } from '../types';
import { TimeRangePicker } from './TimeRangePicker';

interface LogToolbarProps {
  containers: string[];
  selectedContainer: string;
  onContainerChange: (container: string) => void;
  activeSeverities: Set<Severity>;
  onSeverityToggle: (severity: Severity) => void;
  searchText: string;
  onSearchChange: (text: string) => void;
  timeSelection: TimeSelection;
  onTimeSelectionChange: (sel: TimeSelection) => void;
  onRefresh: () => void;
}

const SEVERITIES: { severity: Severity; color: string; solidColor: string }[] = [
  { severity: 'debug', color: colors.blueText, solidColor: colors.blueSolid },
  { severity: 'info', color: colors.greenText, solidColor: colors.greenSolid },
  { severity: 'warn', color: colors.yellowText, solidColor: colors.yellowSolid },
  { severity: 'error', color: colors.redText, solidColor: colors.redSolid },
];

export const LogToolbar: React.FC<LogToolbarProps> = ({
  containers,
  selectedContainer,
  onContainerChange,
  activeSeverities,
  onSeverityToggle,
  searchText,
  onSearchChange,
  timeSelection,
  onTimeSelectionChange,
  onRefresh,
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing[2],
      padding: `${spacing[2]}px ${spacing[3]}px`,
      borderBottom: `1px solid ${colors.gray200}`,
      flexWrap: 'wrap',
    }}>
      {/* Container selector */}
      {containers.length > 1 && (
        <select
          value={selectedContainer}
          onChange={(e) => onContainerChange(e.target.value)}
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.xs,
            padding: `${spacing[1]}px ${spacing[2]}px`,
            border: `1px solid ${colors.gray200}`,
            borderRadius: 4,
            backgroundColor: colors.white,
            color: colors.gray800,
          }}
        >
          <option value="">All containers</option>
          {containers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      {/* Severity level filters */}
      <div style={{ display: 'flex', gap: spacing[1], alignItems: 'center' }}>
        {SEVERITIES.map(({ severity, color, solidColor }) => {
          const active = activeSeverities.has(severity);
          return (
            <button
              key={severity}
              onClick={() => onSeverityToggle(severity)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing[1],
                padding: `3px ${spacing[2]}px`,
                border: `1px solid ${active ? solidColor : colors.gray200}`,
                borderRadius: 4,
                backgroundColor: active ? `${solidColor}18` : 'transparent',
                cursor: 'pointer',
                fontFamily: fonts.mono,
                fontSize: fontSize.xs,
                color: active ? color : colors.gray400,
                transition: 'all 100ms',
              }}
            >
              {/* 8x8 status square */}
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 1,
                backgroundColor: active ? solidColor : colors.gray300,
                flexShrink: 0,
              }} />
              {severity}
            </button>
          );
        })}
      </div>

      {/* Search input */}
      <input
        type="text"
        placeholder="Line contains..."
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          flex: 1,
          minWidth: 140,
          fontFamily: fonts.mono,
          fontSize: fontSize.xs,
          padding: `${spacing[1]}px ${spacing[2]}px`,
          border: `1px solid ${colors.gray200}`,
          borderRadius: 4,
          backgroundColor: colors.white,
          color: colors.gray800,
          outline: 'none',
        }}
      />

      {/* Time range picker (dropdown) */}
      <TimeRangePicker value={timeSelection} onChange={onTimeSelectionChange} />

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        style={{
          padding: `${spacing[1]}px ${spacing[3]}px`,
          border: `1px solid ${colors.gray200}`,
          borderRadius: 4,
          backgroundColor: colors.gray100,
          color: colors.gray800,
          cursor: 'pointer',
          fontFamily: fonts.mono,
          fontSize: fontSize.xs,
          fontWeight: 500,
          transition: 'background-color 100ms',
        }}
      >
        Refresh
      </button>
    </div>
  );
};
