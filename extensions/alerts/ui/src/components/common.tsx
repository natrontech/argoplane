import * as React from 'react';
import { Status, colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { Link, Severity } from '../types';

export const severityStatus: Record<Severity, Status> = {
  critical: 'failed',
  warning: 'degraded',
  info: 'in-progress',
  unknown: 'unknown',
};

export function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Notes shown above data that is stale or incomplete. */
export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    padding: `${spacing[1]}px ${spacing[3]}px`,
    marginBottom: spacing[3],
    backgroundColor: colors.yellowLight,
    border: `1px solid ${colors.yellow}`,
    borderRadius: 4,
    color: colors.yellowText,
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
  }}>
    {children}
  </div>
);

/** Links from annotations. The backend only sends http(s) URLs. */
export const Links: React.FC<{ links: Link[] }> = ({ links }) => (
  <span style={{ display: 'flex', gap: spacing[2], flexWrap: 'wrap' }}>
    {links.map((l) => (
      <a
        key={l.url}
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: colors.orange600, fontSize: fontSize.xs, textDecoration: 'none' }}
      >
        {l.label}
      </a>
    ))}
  </span>
);

export const muted: React.CSSProperties = {
  color: colors.gray500,
  fontSize: fontSize.xs,
  marginTop: 2,
};
