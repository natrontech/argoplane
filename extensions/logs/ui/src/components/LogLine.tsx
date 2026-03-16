import * as React from 'react';
import { colors, fonts } from '@argoplane/shared';
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

/** Shorten pod name: "guestbook-ui-84774bdc6f-k2x9n" -> "guestbook-ui..k2x9n" */
function shortenPod(pod: string): string {
  const match = pod.match(/^(.+)-[a-f0-9]{8,10}-([a-z0-9]{5})$/);
  if (match) return `${match[1]}..${match[2]}`;
  return pod;
}

export const LogLine: React.FC<LogLineProps> = React.memo(({ entry, showPod }) => {
  const isError = entry.severity === 'error';
  const isWarn = entry.severity === 'warn';
  const color = severityColor[entry.severity];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
      padding: '1px 8px',
      fontFamily: fonts.mono,
      fontSize: '11px',
      lineHeight: '18px',
      backgroundColor: isError ? 'rgba(220, 38, 38, 0.06)' : isWarn ? 'rgba(234, 179, 8, 0.04)' : 'transparent',
      borderBottom: '1px solid #f5f5f4',
    }}>
      <span style={{ color: colors.gray500, whiteSpace: 'nowrap', flexShrink: 0, fontSize: '10px' }}>
        {formatTimestamp(entry.timestamp)}
      </span>
      <span style={{
        color,
        fontWeight: 700,
        fontSize: '10px',
        minWidth: 24,
        flexShrink: 0,
        textAlign: 'center',
      }}>
        {severityLabel[entry.severity]}
      </span>
      {showPod && entry.labels?.pod && (
        <span
          title={entry.labels.pod}
          style={{
            color: colors.gray500,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            fontSize: '10px',
          }}
        >
          {shortenPod(entry.labels.pod)}
        </span>
      )}
      <span style={{
        color: colors.gray800,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        flex: 1,
        overflow: 'hidden',
      }}>
        {entry.line}
      </span>
    </div>
  );
});
