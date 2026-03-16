import * as React from 'react';
import { colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { LogEntry, Severity } from '../types';

interface LogLineProps {
  entry: LogEntry;
  showPod: boolean;
}

// Severity bar colors using design system status tokens
const severityBarColor: Record<Severity, string> = {
  error: colors.redSolid,
  warn: colors.yellowSolid,
  info: colors.greenSolid,
  debug: colors.blueSolid,
  unknown: colors.gray300,
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
        borderBottom: `1px solid ${colors.gray200}`,
        cursor: 'pointer',
        transition: 'background-color 100ms',
      }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = colors.gray50; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
    >
      {/* Severity color bar */}
      <div style={{
        width: 4,
        flexShrink: 0,
        backgroundColor: barColor,
      }} />

      <div style={{ flex: 1, minWidth: 0, padding: `${spacing[1]}px ${spacing[2]}px` }}>
        {/* Main log line */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: spacing[2],
          fontFamily: fonts.mono,
          fontSize: fontSize.xs,
          lineHeight: '20px',
        }}>
          <span style={{ color: colors.gray500, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatTimestamp(entry.timestamp)}
          </span>
          {showPod && labels.pod && (
            <span
              title={labels.pod}
              style={{
                color: colors.blueText,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                fontSize: fontSize.xs,
              }}
            >
              {shortenPod(labels.pod)}
            </span>
          )}
          <span style={{
            color: colors.gray800,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            flex: 1,
          }}>
            {entry.line}
          </span>
        </div>

        {/* Expanded labels (key=value chips) */}
        {expanded && labelKeys.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing[1],
            marginTop: spacing[1],
            paddingTop: spacing[1],
            borderTop: `1px solid ${colors.gray200}`,
          }}>
            {labelKeys.map((key) => (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  fontFamily: fonts.mono,
                  fontSize: fontSize.xs,
                  lineHeight: '18px',
                  padding: `1px ${spacing[2]}px`,
                  backgroundColor: colors.gray100,
                  borderRadius: 2,
                  border: `1px solid ${colors.gray200}`,
                  color: colors.gray600,
                }}
              >
                <span style={{ color: colors.blueText }}>{key}</span>
                <span style={{ color: colors.gray400, margin: '0 2px' }}>=</span>
                <span style={{ color: colors.gray800 }}>{labels[key]}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
