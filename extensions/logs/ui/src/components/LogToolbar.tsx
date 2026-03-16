import * as React from 'react';
import { Button, StatusBadge, colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { Severity, TimeRange } from '../types';

interface LogToolbarProps {
  containers: string[];
  selectedContainer: string;
  onContainerChange: (container: string) => void;
  activeSeverities: Set<Severity>;
  onSeverityToggle: (severity: Severity) => void;
  searchText: string;
  onSearchChange: (text: string) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  onRefresh: () => void;
}

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
];

const SEVERITIES: { severity: Severity; label: string; color: string; statusKey: string }[] = [
  { severity: 'debug', label: 'debug', color: colors.blue, statusKey: 'in-progress' },
  { severity: 'info', label: 'info', color: colors.green, statusKey: 'healthy' },
  { severity: 'warn', label: 'warn', color: colors.yellow, statusKey: 'degraded' },
  { severity: 'error', label: 'error', color: colors.red, statusKey: 'failed' },
];

export const LogToolbar: React.FC<LogToolbarProps> = ({
  containers,
  selectedContainer,
  onContainerChange,
  activeSeverities,
  onSeverityToggle,
  searchText,
  onSearchChange,
  timeRange,
  onTimeRangeChange,
  onRefresh,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: spacing[2],
      padding: `${spacing[2]}px ${spacing[3]}px`,
      borderBottom: `1px solid ${colors.gray200}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}>
        {containers.length > 1 && (
          <select
            value={selectedContainer}
            onChange={(e) => onContainerChange(e.target.value)}
            style={{
              fontFamily: fonts.mono,
              fontSize: fontSize.xs,
              padding: '4px 8px',
              border: `1px solid ${colors.gray200}`,
              borderRadius: 4,
              backgroundColor: 'white',
            }}
          >
            <option value="">All containers</option>
            {containers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {SEVERITIES.map(({ severity, label, color, statusKey }) => (
            <button
              key={severity}
              onClick={() => onSeverityToggle(severity)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                border: `1px solid ${activeSeverities.has(severity) ? color : colors.gray200}`,
                borderRadius: 4,
                backgroundColor: activeSeverities.has(severity) ? `${color}11` : 'transparent',
                cursor: 'pointer',
                fontFamily: fonts.mono,
                fontSize: fontSize.xs,
                color: activeSeverities.has(severity) ? color : colors.gray500,
              }}
            >
              <StatusBadge
                status={statusKey as any}
                label=""
              />
              {label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search logs..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: 120,
            fontFamily: fonts.mono,
            fontSize: fontSize.xs,
            padding: '4px 8px',
            border: `1px solid ${colors.gray200}`,
            borderRadius: 4,
          }}
        />

        <div style={{ display: 'flex', gap: 2 }}>
          {TIME_RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onTimeRangeChange(value)}
              style={{
                padding: '3px 8px',
                border: `1px solid ${timeRange === value ? colors.orange500 : colors.gray200}`,
                borderRadius: 4,
                backgroundColor: timeRange === value ? colors.orange500 : 'transparent',
                color: timeRange === value ? 'white' : colors.gray500,
                cursor: 'pointer',
                fontFamily: fonts.mono,
                fontSize: fontSize.xs,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <Button onClick={onRefresh}>Refresh</Button>
      </div>
    </div>
  );
};
