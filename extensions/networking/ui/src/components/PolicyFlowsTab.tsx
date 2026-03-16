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
import { fetchFlows, fetchEndpoints } from '../api';
import {
  FlowSummary,
  FlowsResponse,
  EndpointSummary,
  VerdictFilter,
  DirectionFilter,
  TimeRange,
} from '../types';

// ============================================================
// ArgoCD SPA-safe navigation
// ============================================================

function navigateSPA(url: string) {
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function openPod(appNs: string, appName: string, podNs: string, podName: string) {
  const nodeKey = `/Pod/${podNs}/${podName}/0`;
  navigateSPA(`/applications/${appNs}/${appName}?${new URLSearchParams({ node: nodeKey }).toString()}`);
}

// ============================================================
// Policy Flows Tab
// ============================================================

const REFRESH_INTERVAL = 15_000;

export const PolicyFlowsTab: React.FC<{ resource: any; tree?: any; application: any }> = ({ resource, tree, application }) => {
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>('all');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('5m');
  const [search, setSearch] = React.useState('');

  const policyName = resource?.metadata?.name || '';
  const policyNs = resource?.metadata?.namespace || '';
  const namespace = policyNs || application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // Parse endpointSelector from the policy spec
  const endpointSelector = React.useMemo<Record<string, string>>(() => {
    const sel = resource?.spec?.endpointSelector?.matchLabels;
    if (!sel || typeof sel !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(sel)) {
      if (typeof v === 'string') result[k] = v;
    }
    return result;
  }, [resource]);

  // In Cilium, having `ingress` or `egress` defined in the spec (even as an
  // empty array) activates default deny for that direction. So we check for
  // the field's existence, not whether it has rules.
  const hasIngress = React.useMemo(() => {
    return resource?.spec?.ingress !== undefined;
  }, [resource]);

  const hasEgress = React.useMemo(() => {
    return resource?.spec?.egress !== undefined;
  }, [resource]);

  // Build tree node keys for pod link checks
  const treeNodeKeys = React.useMemo(() => {
    const keys = new Set<string>();
    if (!tree?.nodes) return keys;
    for (const n of tree.nodes) {
      keys.add(`${n.group || ''}/${n.kind}/${n.namespace || ''}/${n.name}`);
    }
    return keys;
  }, [tree]);

  const isPodInTree = React.useCallback((podNs: string, name: string) => {
    return treeNodeKeys.has(`/Pod/${podNs}/${name}`);
  }, [treeNodeKeys]);

  const fetchData = React.useCallback(() => {
    if (!namespace) return;
    const flowsP = fetchFlows(namespace, appNamespace, appName, project, timeRange, 500, verdictFilter, directionFilter)
      .catch(() => null);
    const endpointsP = fetchEndpoints(namespace, appNamespace, appName, project)
      .catch(() => null);

    Promise.all([flowsP, endpointsP])
      .then(([fl, ep]) => {
        if (fl !== null) setFlowsResponse(fl);
        if (ep !== null) setEndpoints(ep);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, timeRange, verdictFilter, directionFilter]);

  React.useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  React.useEffect(() => { const i = setInterval(fetchData, REFRESH_INTERVAL); return () => clearInterval(i); }, [fetchData]);

  const flows = flowsResponse?.flows || [];
  const hubbleAvailable = flowsResponse?.hubble ?? false;

  // Find pods matching this policy's endpointSelector
  const matchingPodNames = React.useMemo(() => {
    const names = new Set<string>();
    if (Object.keys(endpointSelector).length === 0) {
      // Empty selector matches all pods in the namespace
      for (const ep of endpoints) {
        if (ep.namespace === namespace) names.add(ep.name);
      }
    } else {
      for (const ep of endpoints) {
        if (ep.namespace !== namespace) continue;
        const labels = ep.labels || {};
        const matches = Object.entries(endpointSelector).every(
          ([k, v]) => labels[`k8s:${k}`] === v || labels[k] === v,
        );
        if (matches) names.add(ep.name);
      }
    }
    return names;
  }, [endpoints, endpointSelector, namespace]);

  // Filter flows to those affected by this policy:
  // - Ingress flows where dest pod matches the selector
  // - Egress flows where source pod matches the selector
  const policyFlows = React.useMemo(() => {
    return flows.filter((f) => {
      if (hasIngress && f.direction === 'INGRESS' && matchingPodNames.has(f.destPod)) return true;
      if (hasEgress && f.direction === 'EGRESS' && matchingPodNames.has(f.sourcePod)) return true;
      // If policy has both or empty selector, also match by pod name
      if (matchingPodNames.has(f.sourcePod) || matchingPodNames.has(f.destPod)) return true;
      return false;
    });
  }, [flows, matchingPodNames, hasIngress, hasEgress]);

  // Text filter
  const filteredFlows = React.useMemo(() => {
    if (!search.trim()) return policyFlows;
    const q = search.toLowerCase();
    return policyFlows.filter((f) =>
      f.sourcePod.toLowerCase().includes(q) ||
      f.destPod.toLowerCase().includes(q) ||
      (f.sourceIP || '').toLowerCase().includes(q) ||
      (f.destIP || '').toLowerCase().includes(q) ||
      (f.destDNS || '').toLowerCase().includes(q) ||
      f.protocol.toLowerCase().includes(q) ||
      (f.dropReason || '').toLowerCase().includes(q) ||
      f.summary.toLowerCase().includes(q)
    );
  }, [policyFlows, search]);

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div>
        <Button onClick={() => { setLoading(true); fetchData(); }}>Retry</Button>
      </div>
    );
  }

  const droppedCount = policyFlows.filter((f) => f.verdict === 'DROPPED').length;
  const fwdCount = policyFlows.filter((f) => f.verdict === 'FORWARDED').length;
  const selectorDisplay = Object.keys(endpointSelector).length > 0
    ? Object.entries(endpointSelector).map(([k, v]) => `${k}=${v}`).join(', ')
    : 'all pods';

  return (
    <div style={rootStyle}>
      {/* Policy info */}
      <div style={infoStrip}>
        <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray800 }}>{policyName}</span>
        <Sep />
        <span style={metaText}>selector: {selectorDisplay}</span>
        <Sep />
        <span style={metaText}>{matchingPodNames.size} matching pods</span>
      </div>

      {/* Matching pods */}
      {matchingPodNames.size > 0 && (
        <div style={podsRow}>
          <span style={{ fontSize: fontSize.xs, color: colors.gray500, fontWeight: fontWeight.semibold, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Selected pods:</span>
          {Array.from(matchingPodNames).map((name) => (
            isPodInTree(namespace, name) ? (
              <span key={name} onClick={() => openPod(appNamespace, appName, namespace, name)} style={podChipLink} title={`Open ${name}`}>{name}</span>
            ) : (
              <span key={name} style={podChipPlain}>{name}</span>
            )
          ))}
        </div>
      )}

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

      {/* Summary */}
      <div style={summaryStrip}>
        <span style={statText}>{policyFlows.length} flows</span>
        <span style={{ ...statText, color: colors.greenText }}>{fwdCount} forwarded</span>
        {droppedCount > 0 && <span style={{ ...statText, color: colors.redText }}>{droppedCount} dropped</span>}
      </div>

      {!hubbleAvailable && (
        <div style={notice}>Hubble Relay not configured. Enable it to see traffic flows.</div>
      )}

      {hubbleAvailable && (
        <>
          <div style={searchRowStyle}>
            <Input value={search} onChange={setSearch} placeholder="Filter flows..." style={{ flex: 1, maxWidth: 360 }} />
            <span style={countStyle}>{filteredFlows.length} of {policyFlows.length} flows</span>
          </div>

          {filteredFlows.length === 0 ? (
            <EmptyState message={search ? 'No flows match your search' : `No flows for this policy in the last ${timeRange}`} />
          ) : (
            <div style={tableWrap}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Verdict</th>
                    <th style={thStyle}>Dir</th>
                    <th style={thStyle}>Source</th>
                    <th style={thStyle}>Destination</th>
                    <th style={thStyle}>Proto</th>
                    <th style={thStyle}>Port</th>
                    <th style={thStyle}>Drop Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFlows.map((f, i) => {
                    const isDrop = f.verdict === 'DROPPED';
                    const srcDisplay = f.sourcePod || f.sourceIP || 'unknown';
                    const dstDisplay = f.destPod || f.destDNS || f.destIP || 'unknown';
                    const srcLinkable = f.sourcePod && isPodInTree(f.sourceNamespace, f.sourcePod);
                    const dstLinkable = f.destPod && isPodInTree(f.destNamespace, f.destPod);
                    const srcFull = f.sourceNamespace !== namespace ? `${f.sourceNamespace}/${srcDisplay}` : srcDisplay;
                    const dstFull = f.destNamespace !== namespace ? `${f.destNamespace}/${dstDisplay}` : dstDisplay;

                    return (
                      <tr key={`${f.time}-${i}`} style={isDrop ? dropRow : undefined}>
                        <td style={tdStyle}>{formatTime(f.time)}</td>
                        <td style={tdStyle}><VerdictBadge verdict={f.verdict} /></td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: fontSize.xs, fontFamily: fonts.mono, fontWeight: fontWeight.medium, color: f.direction === 'INGRESS' ? colors.blueText : colors.orange600 }}>
                            {f.direction === 'INGRESS' ? 'IN' : f.direction === 'EGRESS' ? 'OUT' : f.direction}
                          </span>
                        </td>
                        <td style={ellipsisTd} title={srcFull}>
                          {srcLinkable ? (
                            <span onClick={() => openPod(appNamespace, appName, f.sourceNamespace, f.sourcePod)} style={podLinkStyle} title={`Open ${f.sourcePod}`}>{srcFull}</span>
                          ) : srcFull}
                        </td>
                        <td style={ellipsisTd} title={dstFull}>
                          {dstLinkable ? (
                            <span onClick={() => openPod(appNamespace, appName, f.destNamespace, f.destPod)} style={podLinkStyle} title={`Open ${f.destPod}`}>{dstFull}</span>
                          ) : dstFull}
                        </td>
                        <td style={tdStyle}>{f.protocol}</td>
                        <td style={tdStyle}>{f.destPort || '-'}</td>
                        <td style={{ ...tdStyle, color: f.dropReason ? colors.redText : colors.gray400 }}>{f.dropReason || '-'}</td>
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
// Sub-components
// ============================================================

const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
  const v = verdict.toUpperCase();
  return <Tag variant={v === 'FORWARDED' ? 'green' : v === 'DROPPED' ? 'red' : 'gray'}>{v === 'FORWARDED' ? 'FWD' : v === 'DROPPED' ? 'DROP' : v}</Tag>;
};

const Sep: React.FC = () => <span style={{ width: 1, height: 16, background: colors.gray200, flexShrink: 0 }} />;

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return iso; }
}

// ============================================================
// Styles
// ============================================================

const rootStyle: React.CSSProperties = { ...panel, overflow: 'hidden', maxWidth: '100%', display: 'flex', flexDirection: 'column' };
const infoStrip: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[3], marginBottom: spacing[3], paddingBottom: spacing[2], borderBottom: `1px solid ${colors.gray200}` };
const metaText: React.CSSProperties = { fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray500 };
const podsRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap', marginBottom: spacing[3] };
const podChipBase: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 2, fontSize: fontSize.xs, fontFamily: fonts.mono, fontWeight: fontWeight.medium };
const podChipLink: React.CSSProperties = { ...podChipBase, background: colors.blueLight, color: colors.blueText, border: `1px solid ${colors.blue}`, cursor: 'pointer' };
const podChipPlain: React.CSSProperties = { ...podChipBase, background: colors.gray100, color: colors.gray600, border: `1px solid ${colors.gray200}` };
const filterRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[1], flexWrap: 'wrap', marginBottom: spacing[3] };
const summaryStrip: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[3], marginBottom: spacing[3] };
const statText: React.CSSProperties = { fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray500 };
const searchRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[3], marginBottom: spacing[3] };
const countStyle: React.CSSProperties = { fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray400, flexShrink: 0 };
const tableWrap: React.CSSProperties = { overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', borderSpacing: 0 };
const thStyle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.gray500, padding: `${spacing[2]}px ${spacing[2]}px`, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { fontSize: fontSize.sm, padding: `${spacing[1]}px ${spacing[2]}px`, borderBottom: `1px solid ${colors.gray100}`, fontFamily: fonts.mono, whiteSpace: 'nowrap' };
const ellipsisTd: React.CSSProperties = { ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const dropRow: React.CSSProperties = { background: colors.redLight };
const podLinkStyle: React.CSSProperties = { fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.blueText, borderBottom: `1px dotted ${colors.blueText}`, cursor: 'pointer' };
const notice: React.CSSProperties = { padding: spacing[3], background: colors.gray50, border: `1px solid ${colors.gray200}`, borderRadius: 4, color: colors.gray500, fontSize: fontSize.sm, marginBottom: spacing[3] };
const pill = (active: boolean): React.CSSProperties => ({ padding: `2px ${spacing[2]}px`, border: `1px solid ${active ? colors.orange500 : colors.gray200}`, borderRadius: 4, background: active ? colors.orange500 : 'transparent', color: active ? '#fff' : colors.gray600, cursor: 'pointer', fontSize: fontSize.xs, fontWeight: fontWeight.medium, fontFamily: fonts.mono, textTransform: 'uppercase' as const, lineHeight: '20px' });
