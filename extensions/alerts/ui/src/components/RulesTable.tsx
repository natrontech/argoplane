import * as React from 'react';
import { DataTable, Cell, StatusBadge, Tag, fonts, fontSize, fontWeight } from '@argoplane/shared';
import { Rule } from '../types';
import { Links, muted, severityStatus } from './common';

function stateCell(r: Rule): React.ReactNode {
  if (r.firing > 0) return <Tag variant="red">{`${r.firing} firing`}</Tag>;
  if (r.pending > 0) return <Tag variant="orange">{`${r.pending} pending`}</Tag>;
  return <Tag variant="gray">inactive</Tag>;
}

export const RulesTable: React.FC<{ rules: Rule[] }> = ({ rules }) => (
  <DataTable columns={['Rule', 'Severity', 'State', 'Health', 'For', 'Links']}>
    {rules.map((r) => (
      <tr key={`${r.group}/${r.name}`}>
        <Cell>
          <div style={{ fontWeight: fontWeight.medium }}>{r.name}</div>
          {r.summary && <div style={{ ...muted, fontFamily: fonts.body, fontSize: fontSize.sm }}>{r.summary}</div>}
          <div style={{ ...muted, whiteSpace: 'pre-wrap' }}>{r.query}</div>
        </Cell>
        <Cell><StatusBadge status={severityStatus[r.severity]} label={r.severity} /></Cell>
        <Cell>{stateCell(r)}</Cell>
        <Cell>
          {/* A rule that fails to evaluate never fires: worth surfacing. */}
          <span title={r.lastError || undefined}>
            <StatusBadge status={r.health === 'ok' ? 'healthy' : r.health === 'err' ? 'failed' : 'unknown'} label={r.health || 'unknown'} />
          </span>
          {r.lastError && <div style={muted}>{r.lastError}</div>}
        </Cell>
        <Cell>{r.for || '-'}</Cell>
        <Cell isLast><Links links={r.links} /></Cell>
      </tr>
    ))}
  </DataTable>
);
