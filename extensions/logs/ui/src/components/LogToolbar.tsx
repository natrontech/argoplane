import * as React from 'react';
import { fonts } from '@argoplane/shared';
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

const SEVERITIES: { severity: Severity; color: string }[] = [
  { severity: 'debug', color: '#6e9fff' },
  { severity: 'info', color: '#4dbd74' },
  { severity: 'warn', color: '#ff9830' },
  { severity: 'error', color: '#ff5286' },
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
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      backgroundColor: '#111118',
      borderBottom: '1px solid #1e1e1e',
      flexWrap: 'wrap',
    }}>
      {/* Container selector */}
      {containers.length > 1 && (
        <select
          value={selectedContainer}
          onChange={(e) => onContainerChange(e.target.value)}
          style={{
            fontFamily: fonts.mono,
            fontSize: '11px',
            padding: '4px 8px',
            border: '1px solid #2a2a3a',
            borderRadius: 4,
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            outline: 'none',
          }}
        >
          <option value="">All containers</option>
          {containers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      {/* Severity level filters (Grafana style) */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {SEVERITIES.map(({ severity, color }) => {
          const active = activeSeverities.has(severity);
          return (
            <button
              key={severity}
              onClick={() => onSeverityToggle(severity)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                border: `1px solid ${active ? color : '#2a2a3a'}`,
                borderRadius: 4,
                backgroundColor: active ? `${color}18` : 'transparent',
                cursor: 'pointer',
                fontFamily: fonts.mono,
                fontSize: '11px',
                color: active ? color : '#555',
                transition: 'all 80ms',
              }}
            >
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: active ? color : '#333',
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
          fontSize: '11px',
          padding: '5px 10px',
          border: '1px solid #2a2a3a',
          borderRadius: 4,
          backgroundColor: '#1a1a2e',
          color: '#e0e0e0',
          outline: 'none',
        }}
      />

      {/* Time range selector */}
      <div style={{ display: 'flex', gap: 2 }}>
        {TIME_RANGES.map(({ label, value }) => {
          const active = timeRange === value;
          return (
            <button
              key={value}
              onClick={() => onTimeRangeChange(value)}
              style={{
                padding: '3px 10px',
                border: `1px solid ${active ? '#6e9fff' : '#2a2a3a'}`,
                borderRadius: 4,
                backgroundColor: active ? '#6e9fff' : 'transparent',
                color: active ? '#111118' : '#8e8e8e',
                cursor: 'pointer',
                fontFamily: fonts.mono,
                fontSize: '11px',
                fontWeight: active ? 600 : 400,
                transition: 'all 80ms',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        style={{
          padding: '4px 12px',
          border: '1px solid #2a2a3a',
          borderRadius: 4,
          backgroundColor: '#1a1a2e',
          color: '#e0e0e0',
          cursor: 'pointer',
          fontFamily: fonts.mono,
          fontSize: '11px',
          transition: 'all 80ms',
        }}
      >
        Refresh
      </button>
    </div>
  );
};
