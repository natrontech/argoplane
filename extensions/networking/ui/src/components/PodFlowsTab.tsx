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
import { fetchFlows, fetchPoliciesWithOwnership, fetchEndpoints } from '../api';
import {
  FlowSummary,
  FlowsResponse,
  PolicySummary,
  EndpointSummary,
  ResourceRef,
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

function resourceNodeUrl(appNs: string, appName: string, group: string, kind: string, ns: string, name: string): string {
  const nodeKey = `${group}/${kind}/${ns}/${name}/0`;
  const base = `/applications/${appNs}/${appName}`;
  return `${base}?${new URLSearchParams({ node: nodeKey }).toString()}`;
}

function openPod(appNs: string, appName: string, podNs: string, podName: string) {
  navigateSPA(resourceNodeUrl(appNs, appName, '', 'Pod', podNs, podName));
}

function openPolicy(appNs: string, appName: string, policy: PolicySummary) {
  const g = 'cilium.io';
  const kind = policy.scope === 'clusterwide' ? 'CiliumClusterwideNetworkPolicy' : 'CiliumNetworkPolicy';
  navigateSPA(resourceNodeUrl(appNs, appName, g, kind, policy.scope === 'clusterwide' ? '' : policy.namespace || '', policy.name));
}

// ============================================================
// Policy matching for dropped flows
// ============================================================

interface PolicyMatch {
  policy: PolicySummary;
  defaultDeny: boolean;
}

function findMatchingPolicies(
  flow: FlowSummary,
  policies: PolicySummary[],
  endpoints: EndpointSummary[],
): PolicyMatch[] {
  if (flow.verdict !== 'DROPPED') return [];

  const targetPod = flow.direction === 'INGRESS' ? flow.destPod : flow.sourcePod;
  const targetNs = flow.direction === 'INGRESS' ? flow.destNamespace : flow.sourceNamespace;
  if (!targetPod) return [];

  const ep = endpoints.find((e) => e.name === targetPod && e.namespace === targetNs);
  const podLabels = ep?.labels || {};

  const matches: PolicyMatch[] = [];

  for (const p of policies) {
    if (p.scope === 'namespace' && p.namespace && p.namespace !== targetNs) continue;

    if (p.endpointSelector && Object.keys(p.endpointSelector).length > 0) {
      const selectorMatches = Object.entries(p.endpointSelector).every(
        ([k, v]) => podLabels[`k8s:${k}`] === v || podLabels[k] === v,
      );
      if (!selectorMatches) continue;
    }

    const hasRulesForDirection = flow.direction === 'INGRESS' ? p.hasIngress : p.hasEgress;
    matches.push({ policy: p, defaultDeny: !hasRulesForDirection });
  }

  return matches;
}

// ============================================================
// Pod Flows Tab
// ============================================================

const REFRESH_INTERVAL = 15_000;

export const PodFlowsTab: React.FC<{ resource: any; tree?: any; application: any }> = ({ resource, tree, application }) => {
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [policies, setPolicies] = React.useState<PolicySummary[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>('all');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('5m');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);

  const podName = resource?.metadata?.name || '';
  const namespace = resource?.metadata?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.namespace === namespace || !n.namespace)
      .map((n: any) => ({ group: n.group || '', kind: n.kind, namespace: n.namespace || '', name: n.name }));
  }, [tree, namespace]);

  // Build a Set of tree node keys for link checks.
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

  const isPolicyInTree = React.useCallback((p: PolicySummary) => {
    return p.scope === 'clusterwide'
      ? treeNodeKeys.has(`cilium.io/CiliumClusterwideNetworkPolicy//${p.name}`)
      : treeNodeKeys.has(`cilium.io/CiliumNetworkPolicy/${p.namespace || ''}/${p.name}`);
  }, [treeNodeKeys]);


  const fetchData = React.useCallback(() => {
    if (!namespace) return;
    const flowsP = fetchFlows(namespace, appNamespace, appName, project, timeRange, 500, verdictFilter, directionFilter)
      .catch(() => null);
    const policiesP = fetchPoliciesWithOwnership(namespace, resourceRefs, appNamespace, appName, project)
      .catch(() => null);
    const endpointsP = fetchEndpoints(namespace, appNamespace, appName, project)
      .catch(() => null);

    Promise.all([flowsP, policiesP, endpointsP])
      .then(([fl, pol, ep]) => {
        if (fl !== null) setFlowsResponse(fl);
        if (pol !== null) setPolicies(pol);
        if (ep !== null) setEndpoints(ep);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, resourceRefs, timeRange, verdictFilter, directionFilter]);

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

  // Reset page when filters change.
  React.useEffect(() => { setPage(0); }, [search, verdictFilter, directionFilter, timeRange]);

  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(filteredFlows.length / PAGE_SIZE));
  const pageFlows = filteredFlows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div>
        <Button onClick={() => { setLoading(true); fetchData(); }}>Retry</Button>
      </div>
    );
  }

  const droppedCount = podFlows.filter((f) => f.verdict === 'DROPPED').length;

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

      {/* Summary strip */}
      <div style={summaryStrip}>
        <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.gray800, fontWeight: fontWeight.semibold }}>{podName}</span>
        <Sep />
        <span style={statText}>{podFlows.length} flows</span>
        {droppedCount > 0 && <span style={{ ...statText, color: colors.redText }}>{droppedCount} dropped</span>}
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
            <>
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
                    <th style={thStyle}>Policy</th>
                  </tr>
                </thead>
                <tbody>
                  {pageFlows.map((f, i) => {
                    const isSource = f.sourcePod === podName;
                    const peer = isSource
                      ? (f.destPod || f.destDNS || f.destIP || 'unknown')
                      : (f.sourcePod || f.sourceIP || 'unknown');
                    const peerNs = isSource ? f.destNamespace : f.sourceNamespace;
                    const peerPod = isSource ? f.destPod : f.sourcePod;
                    const peerDisplay = peerNs && peerNs !== namespace ? `${peerNs}/${peer}` : peer;
                    const isDrop = f.verdict === 'DROPPED';
                    const peerLinkable = peerPod && isPodInTree(peerNs, peerPod);

                    const policyMatches = isDrop ? findMatchingPolicies(f, policies, endpoints) : [];
                    const matchingPolicies = policyMatches.map((m) => m.policy);
                    const hasDefaultDeny = policyMatches.some((m) => m.defaultDeny) && !policyMatches.some((m) => !m.defaultDeny);

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
                          {peerLinkable ? (
                            <span
                              onClick={() => openPod(appNamespace, appName, peerNs, peerPod)}
                              style={peerLinkStyle}
                              title={`Open ${peerPod}`}
                            >
                              {peerDisplay}
                            </span>
                          ) : peerDisplay}
                        </td>
                        <td style={tdStyle}>{f.protocol}</td>
                        <td style={tdStyle}>{f.destPort || '-'}</td>
                        <td style={{ ...tdStyle, color: f.dropReason ? colors.redText : colors.gray400 }}>{f.dropReason || '-'}</td>
                        <td style={tdStyle}>
                          {matchingPolicies.length > 0 ? (
                            <div style={policyChipRow}>
                              {hasDefaultDeny && <span style={{ ...policyChipPlain, color: colors.yellowText, borderColor: colors.yellow }}>default deny</span>}
                              {matchingPolicies.slice(0, hasDefaultDeny ? 1 : 2).map((p) => isPolicyInTree(p) ? (
                                <span
                                  key={p.name}
                                  onClick={(e) => { e.stopPropagation(); openPolicy(appNamespace, appName, p); }}
                                  style={policyChipLink}
                                  title={`Open ${p.name}`}
                                >
                                  {p.name}
                                </span>
                              ) : (
                                <span
                                  key={p.name}
                                  style={policyChipPlain}
                                  title={`${p.ownership} policy: ${p.name}`}
                                >
                                  {p.name}
                                </span>
                              ))}
                              {matchingPolicies.length > (hasDefaultDeny ? 1 : 2) && (
                                <span style={policyChipPlain}>+{matchingPolicies.length - (hasDefaultDeny ? 1 : 2)}</span>
                              )}
                            </div>
                          ) : isDrop ? (
                            <span style={{ color: colors.gray400, fontSize: fontSize.xs }}>unknown</span>
                          ) : (
                            <span style={{ color: colors.gray300, fontSize: fontSize.xs }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={paginationRow}>
                <button style={pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
                <span style={pageLabelStyle}>{page + 1} / {totalPages}</span>
                <button style={pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
            </>
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

const summaryStrip: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[3],
  marginBottom: spacing[3],
  paddingBottom: spacing[2],
  borderBottom: `1px solid ${colors.gray200}`,
};

const statText: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  color: colors.gray500,
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

const peerLinkStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  color: colors.blueText,
  textDecoration: 'none',
  borderBottom: `1px dotted ${colors.blueText}`,
  cursor: 'pointer',
};

const policyChipRow: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
  alignItems: 'center',
};

const policyChipBase: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 2,
  fontSize: 10,
  fontFamily: fonts.mono,
  fontWeight: fontWeight.medium,
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

const policyChipLink: React.CSSProperties = {
  ...policyChipBase,
  background: colors.blueLight,
  color: colors.blueText,
  textDecoration: 'none',
  border: `1px solid ${colors.blue}`,
};

const policyChipPlain: React.CSSProperties = {
  ...policyChipBase,
  background: colors.gray100,
  color: colors.gray600,
  border: `1px solid ${colors.gray200}`,
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

const paginationRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing[3],
  paddingTop: spacing[3],
};

const pageBtn: React.CSSProperties = {
  padding: `2px ${spacing[2]}px`,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  background: 'transparent',
  color: colors.gray600,
  cursor: 'pointer',
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  textTransform: 'uppercase' as const,
  lineHeight: '20px',
};

const pageLabelStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  color: colors.gray500,
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
