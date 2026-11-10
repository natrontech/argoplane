import * as React from 'react';
import { DataTable, Cell, StatusBadge, Tag, fonts, fontSize, fontWeight } from '@argoplane/shared';
import { Alert } from '../types';
import { Links, muted, severityStatus, timeAgo } from './common';

// Labels every alert carries or that the row already shows elsewhere.
const HIDDEN_LABELS = new Set(['alertname', 'severity', 'namespace', 'prometheus', 'cluster']);

function stateTag(a: Alert): React.ReactNode {
  if (a.silenced) return <Tag variant="gray">silenced</Tag>;
  if (a.inhibited) return <Tag variant="gray">inhibited</Tag>;
  return <Tag variant={a.state === 'firing' ? 'red' : 'orange'}>{a.state}</Tag>;
}

function labelLine(labels: Record<string, string>): string {
  return Object.entries(labels)
    .filter(([k]) => !HIDDEN_LABELS.has(k))
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
}

export const AlertsTable: React.FC<{ alerts: Alert[]; showOwner?: boolean }> = ({ alerts, showOwner = true }) => {
  // Re-render every 30s so the "since" column stays current between refreshes.
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const columns = ['Alert', 'Severity', 'State', 'Since', ...(showOwner ? ['Owner'] : []), 'Links'];
  return (
    <DataTable columns={columns}>
      {alerts.map((a, i) => {
        const labels = labelLine(a.labels);
        return (
          <tr key={`${a.group}/${a.name}/${i}`}>
            <Cell>
              <div style={{ fontWeight: fontWeight.medium }}>{a.name}</div>
              {a.summary && <div style={{ ...muted, fontFamily: fonts.body, fontSize: fontSize.sm }}>{a.summary}</div>}
              {labels && <div style={muted}>{labels}</div>}
            </Cell>
            <Cell>
              <StatusBadge status={severityStatus[a.severity]} label={a.severityRaw || a.severity} />
            </Cell>
            <Cell>{stateTag(a)}</Cell>
            <Cell><span title={a.activeAt}>{timeAgo(a.activeAt)}</span></Cell>
            {showOwner && (
              <Cell><Tag variant={a.owner === 'app' ? 'orange' : 'gray'}>{a.owner}</Tag></Cell>
            )}
            <Cell isLast><Links links={a.links} /></Cell>
          </tr>
        );
      })}
    </DataTable>
  );
};
