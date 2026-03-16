import * as React from 'react';
import { fonts } from '@argoplane/shared';
import { LogEntry, Severity } from '../types';

interface LogLineProps {
  entry: LogEntry;
  showPod: boolean;
}

// Grafana-style severity colors
const severityBarColor: Record<Severity, string> = {
  error: '#ff5286',
  warn: '#ff9830',
  info: '#4dbd74',
  debug: '#6e9fff',
  unknown: '#8e8e8e',
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${day} ${h}:${m}:${s}`;
}

/** Shorten pod name: "guestbook-ui-84774bdc6f-k2x9n" -> "guestbook-ui..k2x9n" */
function shortenPod(pod: string): string {
  const match = pod.match(/^(.+)-[a-f0-9]{8,10}-([a-z0-9]{5})$/);
  if (match) return `${match[1]}..${match[2]}`;
  return pod;
}

export const LogLine: React.FC<LogLineProps> = React.memo(({ entry, showPod }) => {
  const [expanded, setExpanded] = React.useState(false);
  const barColor = severityBarColor[entry.severity];
  const labels = entry.labels || {};
  const labelKeys = Object.keys(labels);

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid #1e1e1e',
        cursor: 'pointer',
        transition: 'background-color 80ms',
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1a1a2e'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
    >
      {/* Severity color bar (Grafana style) */}
      <div style={{
        width: 4,
        flexShrink: 0,
        backgroundColor: barColor,
      }} />

      <div style={{ flex: 1, minWidth: 0, padding: '4px 8px' }}>
        {/* Main log line */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontFamily: fonts.mono,
          fontSize: '12px',
          lineHeight: '20px',
        }}>
          <span style={{ color: '#8e8e8e', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatTimestamp(entry.timestamp)}
          </span>
          {showPod && labels.pod && (
            <span
              title={labels.pod}
              style={{
                color: '#6e9fff',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                fontSize: '11px',
              }}
            >
              {shortenPod(labels.pod)}
            </span>
          )}
          <span style={{
            color: '#e0e0e0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            flex: 1,
          }}>
            {entry.line}
          </span>
        </div>

        {/* Expanded labels (Grafana-style key=value chips) */}
        {expanded && labelKeys.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            marginTop: 4,
            paddingTop: 4,
            borderTop: '1px solid #2a2a2a',
          }}>
            {labelKeys.map((key) => (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  fontFamily: fonts.mono,
                  fontSize: '11px',
                  lineHeight: '18px',
                  padding: '1px 6px',
                  backgroundColor: '#2a2a3a',
                  borderRadius: 3,
                  color: '#c0c0c0',
                }}
              >
                <span style={{ color: '#6e9fff' }}>{key}</span>
                <span style={{ color: '#666', margin: '0 2px' }}>=</span>
                <span style={{ color: '#e0e0e0' }}>{labels[key]}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
