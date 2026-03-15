import * as React from 'react';
import {
  Loading,
  EmptyState,
  Tag,
  Button,
  Input,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchFlows } from '../api';
import {
  FlowSummary,
  FlowsResponse,
  VerdictFilter,
  DirectionFilter,
  TimeRange,
} from '../types';

// ============================================================
// Pod Flows Tab - shows flows affecting a specific pod
// ============================================================

const REFRESH_INTERVAL = 15_000;

export const PodFlowsTab: React.FC<{ resource: any; tree?: any; application: any }> = ({ resource, application }) => {
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>('all');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('5m');
  const [search, setSearch] = React.useState('');

  const podName = resource?.metadata?.name || '';
  const namespace = resource?.metadata?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const fetchData = React.useCallback(() => {
    if (!namespace) return;
    fetchFlows(namespace, appNamespace, appName, project, timeRange, 500, verdictFilter, directionFilter)
      .then((fl) => { setFlowsResponse(fl); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, timeRange, verdictFilter, directionFilter]);

  React.useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  React.useEffect(() => { const i = setInterval(fetchData, REFRESH_INTERVAL); return () => clearInterval(i); }, [fetchData]);

  const flows = flowsResponse?.flows || [];
  const hubbleAvailable = flowsResponse?.hubble ?? false;

  // Filter to only flows involving this pod.
  const podFlows = React.useMemo(() => {
    return flows.filter((f) => f.sourcePod === podName || f.destPod === podName);
  }, [flows, podName]);

  // Client-side text filter.
  const filteredFlows = React.useMemo(() => {
    if (!search.trim()) return podFlows;
    const q = search.toLowerCase();
    return podFlows.filter((f) =>
      f.sourcePod.toLowerCase().includes(q) ||
      f.destPod.toLowerCase().includes(q) ||
      (f.sourceIP || '').toLowerCase().includes(q) ||
      (f.destIP || '').toLowerCase().includes(q) ||
      (f.destDNS || '').toLowerCase().includes(q) ||
      f.protocol.toLowerCase().includes(q) ||
      (f.dropReason || '').toLowerCase().includes(q) ||
      f.summary.toLowerCase().includes(q)
    );
  }, [podFlows, search]);

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div>
        <Button onClick={() => { setLoading(true); fetchData(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      {/* Filters */}
      <div style={filterRow}>
        {(['5m', '15m', '1h'] as TimeRange[]).map((t) => (
          <button key={t} onClick={() => setTimeRange(t)} style={pill(timeRange === t)}>{t}</button>
        ))}
        <Sep />
        {(['all', 'forwarded', 'dropped', 'error'] as VerdictFilter[]).map((v) => (
          <button key={v} onClick={() => setVerdictFilter(v)} style={pill(verdictFilter === v)}>{v}</button>
        ))}
        <Sep />
        {(['all', 'ingress', 'egress'] as DirectionFilter[]).map((d) => (
          <button key={d} onClick={() => setDirectionFilter(d)} style={pill(directionFilter === d)}>{d}</button>
        ))}
      </div>

      {!hubbleAvailable && (
        <div style={notice}>Hubble Relay not configured. Enable it to see traffic flows.</div>
      )}

      {hubbleAvailable && (
        <>
          <div style={searchRowStyle}>
            <Input
              value={search}
              onChange={setSearch}
              placeholder="Filter flows..."
              style={{ flex: 1, maxWidth: 360 }}
            />
            <span style={countStyle}>{filteredFlows.length} of {podFlows.length} flows</span>
          </div>

          {filteredFlows.length === 0 ? (
            <EmptyState message={search ? 'No flows match your search' : `No flows for ${podName} in the last ${timeRange}`} />
          ) : (
            <div style={tableWrap}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Verdict</th>
                    <th style={thStyle}>Dir</th>
                    <th style={thStyle}>Peer</th>
                    <th style={thStyle}>Proto</th>
                    <th style={thStyle}>Port</th>
                    <th style={thStyle}>Drop Reason</th>
                    <th style={thStyle}>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFlows.map((f, i) => {
                    const isSource = f.sourcePod === podName;
                    const peer = isSource
                      ? (f.destPod || f.destDNS || f.destIP || 'unknown')
                      : (f.sourcePod || f.sourceIP || 'unknown');
                    const peerNs = isSource ? f.destNamespace : f.sourceNamespace;
                    const peerDisplay = peerNs && peerNs !== namespace ? `${peerNs}/${peer}` : peer;
                    const isDrop = f.verdict === 'DROPPED';

                    return (
                      <tr key={`${f.time}-${i}`} style={isDrop ? dropRow : undefined}>
                        <td style={tdStyle}>{formatTime(f.time)}</td>
                        <td style={tdStyle}><VerdictBadge verdict={f.verdict} /></td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: fontSize.xs, fontFamily: fonts.mono, fontWeight: fontWeight.medium, color: isSource ? colors.orange600 : colors.blueText }}>
                            {isSource ? 'OUT' : 'IN'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={peerDisplay}>
                          {peerDisplay}
                        </td>
                        <td style={tdStyle}>{f.protocol}</td>
                        <td style={tdStyle}>{f.destPort || '-'}</td>
                        <td style={{ ...tdStyle, color: f.dropReason ? colors.redText : colors.gray400 }}>{f.dropReason || '-'}</td>
                        <td style={{ ...tdStyle, color: colors.gray500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.summary}>{f.summary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================
// Small sub-components
// ============================================================

const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
  const v = verdict.toUpperCase();
  const variant = v === 'FORWARDED' ? 'green' : v === 'DROPPED' ? 'red' : 'gray';
  return <Tag variant={variant}>{v === 'FORWARDED' ? 'FWD' : v === 'DROPPED' ? 'DROP' : v}</Tag>;
};

const Sep: React.FC = () => <span style={{ width: 1, height: 16, background: colors.gray200, flexShrink: 0 }} />;

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

// ============================================================
// Styles
// ============================================================

const rootStyle: React.CSSProperties = {
  ...panel,
  overflow: 'hidden',
  maxWidth: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const filterRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[1],
  flexWrap: 'wrap',
  marginBottom: spacing[3],
};

const searchRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[3],
  marginBottom: spacing[3],
};

const countStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  color: colors.gray400,
  flexShrink: 0,
};

const tableWrap: React.CSSProperties = {
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  borderSpacing: 0,
};

const thStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.gray500,
  padding: `${spacing[2]}px ${spacing[2]}px`,
  borderBottom: `2px solid ${colors.gray200}`,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  fontSize: fontSize.sm,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderBottom: `1px solid ${colors.gray100}`,
  fontFamily: fonts.mono,
  whiteSpace: 'nowrap',
};

const dropRow: React.CSSProperties = {
  background: colors.redLight,
};

const notice: React.CSSProperties = {
  padding: spacing[3],
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  color: colors.gray500,
  fontSize: fontSize.sm,
  marginBottom: spacing[3],
};

const pill = (active: boolean): React.CSSProperties => ({
  padding: `2px ${spacing[2]}px`,
  border: `1px solid ${active ? colors.orange500 : colors.gray200}`,
  borderRadius: 4,
  background: active ? colors.orange500 : 'transparent',
  color: active ? '#fff' : colors.gray600,
  cursor: 'pointer',
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  textTransform: 'uppercase' as const,
  lineHeight: '20px',
});
