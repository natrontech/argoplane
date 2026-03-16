import * as React from 'react';
import { StatusBadge, colors, fonts, fontSize } from '@argoplane/shared';
import { LogEntry, Severity } from '../types';

interface LogLineProps {
  entry: LogEntry;
  showPod: boolean;
}

const severityColor: Record<Severity, string> = {
  error: colors.red,
  warn: colors.yellow,
  info: colors.green,
  debug: colors.blue,
  unknown: colors.gray500,
};

const severityLabel: Record<Severity, string> = {
  error: 'ERR',
  warn: 'WRN',
  info: 'INF',
  debug: 'DBG',
  unknown: '???',
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export const LogLine: React.FC<LogLineProps> = ({ entry, showPod }) => {
  const isError = entry.severity === 'error';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '2px 8px',
      fontFamily: fonts.mono,
      fontSize: fontSize.xs,
      lineHeight: '20px',
      backgroundColor: isError ? 'rgba(220, 38, 38, 0.05)' : 'transparent',
      borderBottom: `1px solid ${colors.gray200}`,
    }}>
      <span style={{ color: colors.gray500, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {formatTimestamp(entry.timestamp)}
      </span>
      <StatusBadge
        status={entry.severity === 'error' ? 'failed' : entry.severity === 'warn' ? 'degraded' : entry.severity === 'debug' ? 'in-progress' : 'healthy'}
        label=""
      />
      <span style={{
        color: severityColor[entry.severity],
        fontWeight: 600,
        fontSize: fontSize.xs,
        minWidth: 28,
        flexShrink: 0,
      }}>
        {severityLabel[entry.severity]}
      </span>
      {showPod && entry.labels?.pod && (
        <span style={{
          color: colors.gray500,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {entry.labels.pod}
        </span>
      )}
      <span style={{
        color: colors.gray800,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        flex: 1,
      }}>
        {entry.line}
      </span>
    </div>
  );
};
