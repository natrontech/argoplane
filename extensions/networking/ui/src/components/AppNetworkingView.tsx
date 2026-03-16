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
import { fetchPoliciesWithOwnership, fetchEndpoints, fetchFlows } from '../api';
import {
  PolicySummary,
  PolicyRule,
  EndpointSummary,
  FlowSummary,
  FlowsResponse,
  ResourceRef,
  VerdictFilter,
  DirectionFilter,
  TimeRange,
} from '../types';

// ============================================================
// ArgoCD SPA-safe navigation
// ============================================================

function resourceNodeUrl(appNs: string, appName: string, group: string, kind: string, ns: string, name: string): string {
  const nodeKey = `${group}/${kind}/${ns}/${name}/0`;
  return `/applications/${appNs}/${appName}?${new URLSearchParams({ node: nodeKey }).toString()}`;
}

function navigateSPA(url: string) {
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
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
// Policy-to-flow matching
// ============================================================

interface PolicyMatch {
  policy: PolicySummary;
  defaultDeny: boolean; // true if this policy causes default deny (selects the pod but has no rules for this direction)
}

function findMatchingPolicies(flow: FlowSummary, policies: PolicySummary[], endpoints: EndpointSummary[]): PolicyMatch[] {
  if (flow.verdict !== 'DROPPED') return [];
  const targetPod = flow.direction === 'INGRESS' ? flow.destPod : flow.sourcePod;
  const targetNs = flow.direction === 'INGRESS' ? flow.destNamespace : flow.sourceNamespace;
  if (!targetPod) return [];
  const ep = endpoints.find((e) => e.name === targetPod && e.namespace === targetNs);
  const podLabels = ep?.labels || {};

  const matches: PolicyMatch[] = [];

  for (const p of policies) {
    // Check namespace scope.
    if (p.scope === 'namespace' && p.namespace && p.namespace !== targetNs) continue;

    // Check if the policy's endpointSelector matches the pod.
    if (p.endpointSelector && Object.keys(p.endpointSelector).length > 0) {
      const selectorMatches = Object.entries(p.endpointSelector).every(
        ([k, v]) => podLabels[`k8s:${k}`] === v || podLabels[k] === v
      );
      if (!selectorMatches) continue;
    }

    // Policy selects this pod. Now check if it has rules for this direction.
    const hasRulesForDirection = flow.direction === 'INGRESS' ? p.hasIngress : p.hasEgress;

    if (hasRulesForDirection) {
      // Policy has explicit rules for this direction. It could be allowing
      // other traffic while implicitly denying this flow.
      matches.push({ policy: p, defaultDeny: false });
    } else {
      // Policy selects the pod but has NO rules for this direction.
      // In Cilium, ANY policy selecting a pod activates default deny
      // for the directions it declares. But if another policy on this
      // pod declares rules for this direction, this pod already has
      // default deny active. Mark as default deny contributor.
      //
      // Also: a policy with ingress rules but no egress rules does NOT
      // create default deny for egress. So only flag as default deny
      // if at least one other policy on this pod has rules for this direction.
      matches.push({ policy: p, defaultDeny: true });
    }
  }

  // If we only have default-deny matches (no policy with explicit rules for
  // this direction), check if ANY policy that selects this pod has rules for
  // this direction. If none do, this is a pure default deny scenario.
  const hasExplicitMatch = matches.some((m) => !m.defaultDeny);
  if (!hasExplicitMatch && matches.length > 0) {
    // Keep the default deny matches. They are the policies selecting the pod
    // that collectively cause traffic to be denied.
  }

  return matches;
}

// ============================================================
// "Allowed traffic" summary: compute from policies + endpoints
// ============================================================

interface AllowedTrafficEntry {
  podName: string;
  ingress: string[];
  egress: string[];
}

function computeAllowedTraffic(policies: PolicySummary[], endpoints: EndpointSummary[]): AllowedTrafficEntry[] {
  const podNames = [...new Set(endpoints.map((e) => e.name))];
  return podNames.map((podName) => {
    const ep = endpoints.find((e) => e.name === podName);
    const podLabels = ep?.labels || {};
    const matching = policies.filter((p) => {
      if (p.endpointSelector && Object.keys(p.endpointSelector).length > 0) {
        return Object.entries(p.endpointSelector).every(([k, v]) => podLabels[`k8s:${k}`] === v || podLabels[k] === v);
      }
      return true;
    });
    const ingress: string[] = [];
    const egress: string[] = [];
    for (const p of matching) {
      for (const r of p.ingressRules || []) {
        const ports = r.ports.join(', ') || 'any';
        const peers = r.peers.join(', ') || 'any';
        ingress.push(`${ports} from ${peers}`);
      }
      for (const r of p.egressRules || []) {
        const ports = r.ports.join(', ') || 'any';
        const peers = r.peers.join(', ') || 'any';
        egress.push(`${ports} to ${peers}`);
      }
    }
    return { podName, ingress: ingress.length > 0 ? ingress : ['(no rules)'], egress: egress.length > 0 ? egress : ['(no rules)'] };
  });
}

// ============================================================
// Flow aggregation
// ============================================================

interface AggregatedFlow {
  key: string;
  sourcePod: string;
  sourceNamespace: string;
  sourceIP: string;
  destPod: string;
  destNamespace: string;
  destIP: string;
  destDNS: string;
  protocol: string;
  destPort: number;
  forwarded: number;
  dropped: number;
  errors: number;
  lastSeen: string;
  dropReasons: string[];
}

function aggregateFlows(flows: FlowSummary[]): AggregatedFlow[] {
  const map = new Map<string, AggregatedFlow>();
  for (const f of flows) {
    const src = f.sourcePod || f.sourceIP || 'unknown';
    const dst = f.destPod || f.destDNS || f.destIP || 'unknown';
    const key = `${src}|${dst}|${f.protocol}|${f.destPort}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        sourcePod: f.sourcePod, sourceNamespace: f.sourceNamespace, sourceIP: f.sourceIP || '',
        destPod: f.destPod, destNamespace: f.destNamespace, destIP: f.destIP || '', destDNS: f.destDNS || '',
        protocol: f.protocol, destPort: f.destPort,
        forwarded: 0, dropped: 0, errors: 0, lastSeen: f.time, dropReasons: [],
      };
      map.set(key, agg);
    }
    if (f.verdict === 'FORWARDED') agg.forwarded++;
    else if (f.verdict === 'DROPPED') agg.dropped++;
    else agg.errors++;
    if (f.dropReason && !agg.dropReasons.includes(f.dropReason)) agg.dropReasons.push(f.dropReason);
    if (f.time > agg.lastSeen) agg.lastSeen = f.time;
  }
  return Array.from(map.values()).sort((a, b) => (b.forwarded + b.dropped + b.errors) - (a.forwarded + a.dropped + a.errors));
}

// ============================================================
// Sorting
// ============================================================

type SortField = 'time' | 'verdict' | 'direction' | 'source' | 'dest' | 'protocol' | 'port';
type SortDir = 'asc' | 'desc';

function sortFlows(flows: FlowSummary[], field: SortField, dir: SortDir): FlowSummary[] {
  const sorted = [...flows];
  const m = dir === 'asc' ? 1 : -1;
  sorted.sort((a, b) => {
    let av: string | number, bv: string | number;
    switch (field) {
      case 'time': av = a.time; bv = b.time; break;
      case 'verdict': av = a.verdict; bv = b.verdict; break;
      case 'direction': av = a.direction; bv = b.direction; break;
      case 'source': av = a.sourcePod || a.sourceIP || ''; bv = b.sourcePod || b.sourceIP || ''; break;
      case 'dest': av = a.destPod || a.destDNS || a.destIP || ''; bv = b.destPod || b.destDNS || b.destIP || ''; break;
      case 'protocol': av = a.protocol; bv = b.protocol; break;
      case 'port': av = a.destPort; bv = b.destPort; break;
      default: return 0;
    }
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * m;
    return String(av).localeCompare(String(bv)) * m;
  });
  return sorted;
}

// ============================================================
// Sub-components
// ============================================================

const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
  const v = verdict.toUpperCase();
  return <Tag variant={v === 'FORWARDED' ? 'green' : v === 'DROPPED' ? 'red' : 'gray'}>{v === 'FORWARDED' ? 'FWD' : v === 'DROPPED' ? 'DROP' : v}</Tag>;
};

const DirectionBadge: React.FC<{ direction: string }> = ({ direction }) => {
  const d = direction.toUpperCase();
  return <span style={{ fontSize: fontSize.xs, fontFamily: fonts.mono, fontWeight: fontWeight.medium, color: d === 'INGRESS' ? colors.blueText : colors.orange600 }}>{d === 'INGRESS' ? 'IN' : d === 'EGRESS' ? 'OUT' : d}</span>;
};

const SortableHeader: React.FC<{ label: string; field: SortField; currentField: SortField; currentDir: SortDir; onSort: (f: SortField) => void }> = ({ label, field, currentField, currentDir, onSort }) => {
  const active = currentField === field;
  return <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(field)}>{label}{active ? (currentDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}</th>;
};

const ResourceLink: React.FC<{ onClick: () => void; children: React.ReactNode; title?: string }> = ({ onClick, children, title }) => (
  <span onClick={(e) => { e.stopPropagation(); onClick(); }} title={title} style={linkStyle}>{children}</span>
);

/** Clickable cell value that sets the search filter. */
const Filterable: React.FC<{ value: string; onFilter: (v: string) => void; children?: React.ReactNode }> = ({ value, onFilter, children }) => (
  <span onClick={(e) => { e.stopPropagation(); onFilter(value); }} style={filterableStyle} title={`Filter by "${value}"`}>{children || value}</span>
);

// ============================================================
// Main component
// ============================================================

const REFRESH_INTERVAL = 30_000;
const PAGE_SIZE = 50;

export const AppNetworkingView: React.FC<{ application: any; tree?: any }> = ({ application, tree }) => {
  const [policies, setPolicies] = React.useState<PolicySummary[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>('all');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('5m');
  const [search, setSearch] = React.useState('');
  const [sortField, setSortField] = React.useState<SortField>('time');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [page, setPage] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState<'flows' | 'policies' | 'allowed'>('flows');
  const [expandedFlowIdx, setExpandedFlowIdx] = React.useState<number | null>(null);
  const [expandedPolicy, setExpandedPolicy] = React.useState<string | null>(null);
  const [aggregated, setAggregated] = React.useState(false);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    return tree.nodes.filter((n: any) => n.namespace === namespace || !n.namespace).map((n: any) => ({ group: n.group || '', kind: n.kind, namespace: n.namespace || '', name: n.name }));
  }, [tree, namespace]);

  const treeNodeKeys = React.useMemo(() => {
    const keys = new Set<string>();
    if (!tree?.nodes) return keys;
    for (const n of tree.nodes) keys.add(`${n.group || ''}/${n.kind}/${n.namespace || ''}/${n.name}`);
    return keys;
  }, [tree]);

  const isPodInTree = React.useCallback((ns: string, name: string) => treeNodeKeys.has(`/Pod/${ns}/${name}`), [treeNodeKeys]);
  const isPolicyInTree = React.useCallback((p: PolicySummary) => {
    return p.scope === 'clusterwide'
      ? treeNodeKeys.has(`cilium.io/CiliumClusterwideNetworkPolicy//${p.name}`)
      : treeNodeKeys.has(`cilium.io/CiliumNetworkPolicy/${p.namespace || ''}/${p.name}`);
  }, [treeNodeKeys]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;
    Promise.all([
      fetchPoliciesWithOwnership(namespace, resourceRefs, appNamespace, appName, project).catch(() => null),
      fetchEndpoints(namespace, appNamespace, appName, project).catch(() => null),
      fetchFlows(namespace, appNamespace, appName, project, timeRange, 500, verdictFilter, directionFilter).catch(() => null),
    ]).then(([pol, ep, fl]) => {
      // Only update state if the fetch succeeded; keep previous data on failure.
      if (pol !== null) setPolicies(pol);
      if (ep !== null) setEndpoints(ep);
      if (fl !== null) setFlowsResponse(fl);
      setError(null);
    })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, resourceRefs, timeRange, verdictFilter, directionFilter]);

  React.useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);
  React.useEffect(() => { const i = setInterval(fetchAll, REFRESH_INTERVAL); return () => clearInterval(i); }, [fetchAll]);
  React.useEffect(() => { setPage(0); setExpandedFlowIdx(null); }, [search, sortField, sortDir, verdictFilter, directionFilter, timeRange, aggregated]);

  const flows = flowsResponse?.flows || [];
  const flowSummary = flowsResponse?.summary;
  const hubbleAvailable = flowsResponse?.hubble ?? false;

  const filteredFlows = React.useMemo(() => {
    if (!search.trim()) return flows;
    const q = search.toLowerCase();
    return flows.filter((f) =>
      f.sourcePod.toLowerCase().includes(q) || f.destPod.toLowerCase().includes(q) ||
      (f.sourceIP || '').toLowerCase().includes(q) || (f.destIP || '').toLowerCase().includes(q) ||
      (f.destDNS || '').toLowerCase().includes(q) || f.protocol.toLowerCase().includes(q) ||
      (f.dropReason || '').toLowerCase().includes(q) || f.summary.toLowerCase().includes(q) ||
      f.sourceNamespace.toLowerCase().includes(q) || f.destNamespace.toLowerCase().includes(q)
    );
  }, [flows, search]);

  const sortedFlows = React.useMemo(() => sortFlows(filteredFlows, sortField, sortDir), [filteredFlows, sortField, sortDir]);
  const aggregatedFlows = React.useMemo(() => aggregateFlows(filteredFlows), [filteredFlows]);

  const policyDropCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of flows.filter((f) => f.verdict === 'DROPPED')) {
      for (const m of findMatchingPolicies(f, policies, endpoints)) {
        const key = `${m.policy.scope}-${m.policy.name}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [flows, policies, endpoints]);

  const allowedTraffic = React.useMemo(() => computeAllowedTraffic(policies, endpoints), [policies, endpoints]);

  const totalPages = Math.max(1, Math.ceil((aggregated ? aggregatedFlows.length : sortedFlows.length) / PAGE_SIZE));
  const pageFlows = aggregated ? aggregatedFlows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : sortedFlows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'time' ? 'desc' : 'asc'); }
  };

  const applyFilter = (value: string) => { setSearch(value); setActiveTab('flows'); };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div><Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button></div>;

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBar}>
        <div style={topLeft}>
          <span style={appLabelS}>{appName}</span>
          <span style={nsLabelS}>{namespace}</span>
          {hubbleAvailable && flowSummary && (<>
            <Sep />
            <Stat label="flows" value={flowSummary.total} />
            <Stat label="fwd" value={flowSummary.forwarded} color={colors.greenText} />
            <Stat label="drop" value={flowSummary.dropped} color={flowSummary.dropped > 0 ? colors.redText : undefined} />
            <Stat label="err" value={flowSummary.error} color={flowSummary.error > 0 ? colors.yellowText : undefined} />
          </>)}
        </div>
        <div style={topRight}>
          {(['5m', '15m', '1h'] as TimeRange[]).map((t) => <button key={t} onClick={() => setTimeRange(t)} style={pill(timeRange === t)}>{t}</button>)}
          <Sep />
          {(['all', 'forwarded', 'dropped', 'error'] as VerdictFilter[]).map((v) => <button key={v} onClick={() => setVerdictFilter(v)} style={pill(verdictFilter === v)}>{v}</button>)}
          <Sep />
          {(['all', 'ingress', 'egress'] as DirectionFilter[]).map((d) => <button key={d} onClick={() => setDirectionFilter(d)} style={pill(directionFilter === d)}>{d}</button>)}
        </div>
      </div>

      {/* Tabs */}
      <div style={tabBar}>
        <button style={tab(activeTab === 'flows')} onClick={() => { setActiveTab('flows'); setSearch(''); }}>Flows {hubbleAvailable && `(${flows.length})`}</button>
        <button style={tab(activeTab === 'policies')} onClick={() => { setActiveTab('policies'); setSearch(''); }}>Policies ({policies.length})</button>
        <button style={tab(activeTab === 'allowed')} onClick={() => setActiveTab('allowed')}>Allowed Traffic</button>
      </div>

      {/* === Flows tab === */}
      {activeTab === 'flows' && (
        <div style={tabContent}>
          {!hubbleAvailable && <div style={notice}>Hubble Relay not configured. Enable it to see traffic flows.</div>}
          {hubbleAvailable && (<>
            <div style={searchRow}>
              <Input value={search} onChange={setSearch} placeholder="Filter by pod, IP, DNS, protocol, drop reason..." style={{ flex: 1, maxWidth: 420 }} />
              <button style={pill(aggregated)} onClick={() => setAggregated(!aggregated)}>Aggregate</button>
              <span style={countLabel}>{aggregated ? `${aggregatedFlows.length} groups` : `${filteredFlows.length} flows`}</span>
            </div>

            {(aggregated ? aggregatedFlows.length : filteredFlows.length) === 0 ? (
              <EmptyState message={search ? 'No flows match your search' : `No flows in the last ${timeRange}`} />
            ) : aggregated ? (
              /* Aggregated view */
              <div style={tableWrap}>
                <table style={tableStyle}>
                  <thead><tr>
                    <th style={thStyle}>Source</th><th style={thStyle}>Destination</th><th style={thStyle}>Proto</th><th style={thStyle}>Port</th>
                    <th style={thStyle}>Fwd</th><th style={thStyle}>Drop</th><th style={thStyle}>Err</th><th style={thStyle}>Drop Reasons</th><th style={thStyle}>Last Seen</th>
                  </tr></thead>
                  <tbody>
                    {(pageFlows as AggregatedFlow[]).map((a) => {
                      const srcDisplay = a.sourcePod || a.sourceIP || 'unknown';
                      const dstDisplay = a.destPod || a.destDNS || a.destIP || 'unknown';
                      const srcLinkable = a.sourcePod && isPodInTree(a.sourceNamespace, a.sourcePod);
                      const dstLinkable = a.destPod && isPodInTree(a.destNamespace, a.destPod);
                      const hasDrop = a.dropped > 0;
                      return (
                        <tr key={a.key} style={hasDrop ? dropRowStyle : undefined}>
                          <td style={ellipsisTd}>{srcLinkable ? <ResourceLink onClick={() => openPod(appNamespace, appName, a.sourceNamespace, a.sourcePod)} title={`Open ${a.sourcePod}`}>{srcDisplay}</ResourceLink> : <Filterable value={srcDisplay} onFilter={applyFilter} />}</td>
                          <td style={ellipsisTd}>{dstLinkable ? <ResourceLink onClick={() => openPod(appNamespace, appName, a.destNamespace, a.destPod)} title={`Open ${a.destPod}`}>{dstDisplay}</ResourceLink> : <Filterable value={dstDisplay} onFilter={applyFilter} />}</td>
                          <td style={tdStyle}><Filterable value={a.protocol} onFilter={applyFilter} /></td>
                          <td style={tdStyle}>{a.destPort || '-'}</td>
                          <td style={{ ...tdStyle, color: colors.greenText }}>{a.forwarded}</td>
                          <td style={{ ...tdStyle, color: hasDrop ? colors.redText : colors.gray400 }}>{a.dropped}</td>
                          <td style={{ ...tdStyle, color: a.errors > 0 ? colors.yellowText : colors.gray400 }}>{a.errors}</td>
                          <td style={{ ...tdStyle, color: colors.redText, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.dropReasons.join(', ') || '-'}</td>
                          <td style={tdStyle}>{formatTime(a.lastSeen)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Individual flows */
              <>
                <div style={tableWrap}>
                  <table style={tableStyle}>
                    <thead><tr>
                      <SortableHeader label="Time" field="time" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Verdict" field="verdict" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Dir" field="direction" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Source" field="source" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Destination" field="dest" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Proto" field="protocol" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Port" field="port" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                      <th style={thStyle}>Drop Reason</th>
                      <th style={thStyle}>Policy</th>
                    </tr></thead>
                    <tbody>
                      {(pageFlows as FlowSummary[]).map((f, i) => {
                        const globalIdx = page * PAGE_SIZE + i;
                        return (
                          <FlowRow
                            key={`${f.time}-${globalIdx}`}
                            flow={f}
                            namespace={namespace}
                            appNamespace={appNamespace}
                            appName={appName}
                            policies={policies}
                            endpoints={endpoints}
                            isPodInTree={isPodInTree}
                            isPolicyInTree={isPolicyInTree}
                            onPolicyClick={(name) => { setActiveTab('policies'); setSearch(name); }}
                            onFilter={applyFilter}
                            expanded={expandedFlowIdx === globalIdx}
                            onToggleExpand={() => setExpandedFlowIdx(expandedFlowIdx === globalIdx ? null : globalIdx)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={paginationRow}>
                    <button style={pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
                    <span style={pageLabelS}>{page + 1} / {totalPages}</span>
                    <button style={pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
                  </div>
                )}
              </>
            )}
          </>)}
        </div>
      )}

      {/* === Policies tab === */}
      {activeTab === 'policies' && (
        <div style={tabContent}>
          {policies.length === 0 ? <EmptyState message="No Cilium network policies found" /> : (
            <div style={tableWrap}>
              <table style={tableStyle}>
                <thead><tr>
                  <th style={thStyle}>Name</th><th style={thStyle}>Scope</th><th style={thStyle}>Owner</th>
                  <th style={thStyle}>Selector</th><th style={thStyle}>Ingress</th><th style={thStyle}>Egress</th>
                  <th style={thStyle}>Drops</th><th style={thStyle}>Created</th>
                </tr></thead>
                <tbody>
                  {policies.map((p) => (
                    <PolicyRowGroup
                      key={`${p.scope}-${p.name}`}
                      policy={p}
                      appNamespace={appNamespace}
                      appName={appName}
                      isPolicyInTree={isPolicyInTree}
                      dropCount={policyDropCounts.get(`${p.scope}-${p.name}`) || 0}
                      onDropCountClick={() => { setActiveTab('flows'); setVerdictFilter('dropped'); setSearch(''); }}
                      expanded={expandedPolicy === `${p.scope}-${p.name}`}
                      onToggle={() => setExpandedPolicy(expandedPolicy === `${p.scope}-${p.name}` ? null : `${p.scope}-${p.name}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* === Allowed Traffic tab === */}
      {activeTab === 'allowed' && (
        <div style={tabContent}>
          {allowedTraffic.length === 0 ? <EmptyState message="No endpoints found" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
              {allowedTraffic.map((entry) => (
                <div key={entry.podName} style={allowedCard}>
                  <div style={allowedCardHeader}>
                    {isPodInTree(namespace, entry.podName) ? (
                      <ResourceLink onClick={() => openPod(appNamespace, appName, namespace, entry.podName)} title={`Open ${entry.podName}`}>{entry.podName}</ResourceLink>
                    ) : (
                      <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray800 }}>{entry.podName}</span>
                    )}
                  </div>
                  <div style={allowedGrid}>
                    <div>
                      <div style={allowedLabel}>INGRESS (allowed in)</div>
                      {entry.ingress.map((r, i) => <div key={i} style={allowedRule}>{r}</div>)}
                    </div>
                    <div>
                      <div style={allowedLabel}>EGRESS (allowed out)</div>
                      {entry.egress.map((r, i) => <div key={i} style={allowedRule}>{r}</div>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// FlowRow with expandable detail
// ============================================================

const FlowRow: React.FC<{
  flow: FlowSummary; namespace: string; appNamespace: string; appName: string;
  policies: PolicySummary[]; endpoints: EndpointSummary[];
  isPodInTree: (ns: string, name: string) => boolean; isPolicyInTree: (p: PolicySummary) => boolean;
  onPolicyClick: (name: string) => void; onFilter: (v: string) => void;
  expanded: boolean; onToggleExpand: () => void;
}> = ({ flow: f, namespace, appNamespace, appName, policies, endpoints, isPodInTree, isPolicyInTree, onPolicyClick, onFilter, expanded, onToggleExpand }) => {
  const srcDisplay = f.sourcePod ? (f.sourceNamespace !== namespace ? `${f.sourceNamespace}/${f.sourcePod}` : f.sourcePod) : f.sourceIP || 'unknown';
  const dstDisplay = f.destPod ? (f.destNamespace !== namespace ? `${f.destNamespace}/${f.destPod}` : f.destPod) : f.destDNS || f.destIP || 'unknown';
  const srcLinkable = f.sourcePod && isPodInTree(f.sourceNamespace, f.sourcePod);
  const dstLinkable = f.destPod && isPodInTree(f.destNamespace, f.destPod);
  const isDrop = f.verdict === 'DROPPED';

  const policyMatches = React.useMemo(() => isDrop ? findMatchingPolicies(f, policies, endpoints) : [], [f, isDrop, policies, endpoints]);
  const matchingPolicies = React.useMemo(() => policyMatches.map((m) => m.policy), [policyMatches]);
  const hasDefaultDeny = React.useMemo(() => policyMatches.some((m) => m.defaultDeny) && !policyMatches.some((m) => !m.defaultDeny), [policyMatches]);

  return (<>
    <tr style={{ ...(isDrop ? dropRowStyle : {}), cursor: 'pointer' }} onClick={onToggleExpand}>
      <td style={tdStyle}>{formatTime(f.time)}</td>
      <td style={tdStyle}><VerdictBadge verdict={f.verdict} /></td>
      <td style={tdStyle}><DirectionBadge direction={f.direction} /></td>
      <td style={ellipsisTd} title={srcDisplay}>
        {srcLinkable ? <ResourceLink onClick={() => openPod(appNamespace, appName, f.sourceNamespace, f.sourcePod)} title={`Open ${f.sourcePod}`}>{srcDisplay}</ResourceLink> : <Filterable value={srcDisplay} onFilter={onFilter} />}
      </td>
      <td style={ellipsisTd} title={dstDisplay}>
        {dstLinkable ? <ResourceLink onClick={() => openPod(appNamespace, appName, f.destNamespace, f.destPod)} title={`Open ${f.destPod}`}>{dstDisplay}</ResourceLink> : <Filterable value={dstDisplay} onFilter={onFilter} />}
      </td>
      <td style={tdStyle}><Filterable value={f.protocol} onFilter={onFilter} /></td>
      <td style={tdStyle}>{f.destPort || '-'}</td>
      <td style={{ ...tdStyle, color: f.dropReason ? colors.redText : colors.gray400 }}>
        {f.dropReason ? <Filterable value={f.dropReason} onFilter={onFilter}><span style={{ color: colors.redText }}>{f.dropReason}</span></Filterable> : '-'}
      </td>
      <td style={tdStyle}>
        {matchingPolicies.length > 0 ? (
          <div style={policyChipRow}>
            {hasDefaultDeny && <span style={{ ...policyChipPlain, color: colors.yellowText, borderColor: colors.yellow }}>default deny</span>}
            {matchingPolicies.slice(0, hasDefaultDeny ? 1 : 2).map((p) => isPolicyInTree(p) ? (
              <span key={p.name} onClick={(e) => { e.stopPropagation(); openPolicy(appNamespace, appName, p); }} style={policyChipLink} title={`Open ${p.name}`}>{p.name}</span>
            ) : (
              <span key={p.name} style={policyChipPlain} onClick={(e) => { e.stopPropagation(); onPolicyClick(p.name); }} title={`View ${p.name}`}>{p.name}</span>
            ))}
            {matchingPolicies.length > (hasDefaultDeny ? 1 : 2) && <span style={policyChipPlain}>+{matchingPolicies.length - (hasDefaultDeny ? 1 : 2)}</span>}
          </div>
        ) : isDrop ? <span style={{ color: colors.gray400, fontSize: fontSize.xs }}>unknown</span> : <span style={{ color: colors.gray300, fontSize: fontSize.xs }}>-</span>}
      </td>
    </tr>
    {expanded && (
      <tr><td colSpan={9} style={expandedTd}>
        <div style={expandedContent}>
          <div style={expandedGrid}>
            <KV label="Source" value={`${f.sourceNamespace}/${f.sourcePod || f.sourceIP || '?'}`} />
            <KV label="Destination" value={`${f.destNamespace}/${f.destPod || f.destDNS || f.destIP || '?'}`} />
            <KV label="Source IP" value={f.sourceIP || '-'} />
            <KV label="Dest IP" value={f.destIP || '-'} />
            {f.destDNS && <KV label="DNS" value={f.destDNS} />}
            <KV label="Protocol" value={`${f.protocol}:${f.destPort}`} />
            <KV label="Reply" value={f.isReply ? 'yes' : 'no'} />
            <KV label="Summary" value={f.summary} />
          </div>
          {isDrop && (
            <div style={whyDropped}>
              <div style={whyDroppedTitle}>Why was this dropped?</div>
              {f.dropReason && <div style={whyDroppedReason}>Cilium drop reason: <strong>{f.dropReason}</strong></div>}
              {policyMatches.length > 0 ? (
                <div style={whyDroppedDetail}>
                  {hasDefaultDeny ? (
                    <>
                      <div style={{ marginBottom: 6, color: colors.yellowText }}>
                        Default deny: the following {policyMatches.length === 1 ? 'policy selects' : 'policies select'} {f.direction === 'INGRESS' ? f.destPod : f.sourcePod} but {policyMatches.length === 1 ? 'has' : 'have'} no {f.direction === 'INGRESS' ? 'ingress' : 'egress'} rules allowing this traffic. In Cilium, any policy selecting a pod activates default deny for the directions it governs.
                      </div>
                      {policyMatches.map((m) => (
                        <div key={m.policy.name} style={whyDroppedPolicy}>
                          <strong>{m.policy.name}</strong> ({m.policy.ownership}, {m.policy.scope})
                          {m.defaultDeny && <span style={{ marginLeft: 6, fontSize: fontSize.xs, color: colors.yellowText }}>default deny</span>}
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      Matching {f.direction === 'INGRESS' ? 'ingress' : 'egress'} policies on {f.direction === 'INGRESS' ? f.destPod : f.sourcePod}:
                      {policyMatches.map((m) => (
                        <div key={m.policy.name} style={whyDroppedPolicy}>
                          <strong>{m.policy.name}</strong> ({m.policy.ownership})
                          {(f.direction === 'INGRESS' ? m.policy.ingressRules : m.policy.egressRules)?.map((r, ri) => (
                            <div key={ri} style={ruleDetail}>
                              Allow {r.ports.join(', ')} {f.direction === 'INGRESS' ? 'from' : 'to'} {r.peers.join(', ')}
                            </div>
                          ))}
                          <div style={ruleExplanation}>
                            This policy does not have a rule that permits {f.protocol}:{f.destPort} {f.direction === 'INGRESS' ? 'from' : 'to'} {f.direction === 'INGRESS' ? (f.sourcePod || f.sourceIP || 'the source') : (f.destPod || f.destDNS || f.destIP || 'the destination')}.
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div style={whyDroppedDetail}>No matching policies found. Traffic may be denied by a default-deny policy or a policy not visible to this app.</div>
              )}
            </div>
          )}
        </div>
      </td></tr>
    )}
  </>);
};

// ============================================================
// PolicyRowGroup with expandable rule details
// ============================================================

const PolicyRowGroup: React.FC<{
  policy: PolicySummary; appNamespace: string; appName: string;
  isPolicyInTree: (p: PolicySummary) => boolean; dropCount: number;
  onDropCountClick: () => void; expanded: boolean; onToggle: () => void;
}> = ({ policy: p, appNamespace, appName, isPolicyInTree, dropCount, onDropCountClick, expanded, onToggle }) => {
  const sel = p.endpointSelector ? Object.entries(p.endpointSelector).map(([k, v]) => `${k}=${v}`).join(', ') : 'all pods';
  const inTree = isPolicyInTree(p);

  return (<>
    <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
      <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>
        {inTree ? <ResourceLink onClick={() => openPolicy(appNamespace, appName, p)} title={`Open ${p.name}`}>{p.name}</ResourceLink> : p.name}
        <span style={{ marginLeft: 4, fontSize: 9, color: colors.gray400 }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </td>
      <td style={tdStyle}><Tag variant={p.scope === 'clusterwide' ? 'orange' : 'gray'}>{p.scope}</Tag></td>
      <td style={tdStyle}><Tag variant={p.ownership === 'app' ? 'green' : 'gray'}>{p.ownership === 'app' ? 'App' : 'Platform'}</Tag></td>
      <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sel}>{sel}</td>
      <td style={tdStyle}>{p.hasIngress ? <span style={{ color: colors.greenText }}>{p.ingressRuleCount} rules</span> : <span style={{ color: colors.gray400 }}>-</span>}</td>
      <td style={tdStyle}>{p.hasEgress ? <span style={{ color: colors.orange600 }}>{p.egressRuleCount} rules</span> : <span style={{ color: colors.gray400 }}>-</span>}</td>
      <td style={tdStyle}>{dropCount > 0 ? <span style={dropCountLink} onClick={(e) => { e.stopPropagation(); onDropCountClick(); }}>{dropCount} drops</span> : <span style={{ color: colors.gray400 }}>0</span>}</td>
      <td style={tdStyle}>{formatTime(p.creationTimestamp)}</td>
    </tr>
    {expanded && (
      <tr><td colSpan={8} style={expandedTd}>
        <div style={expandedContent}>
          {p.description && <div style={{ color: colors.gray600, fontSize: fontSize.sm, marginBottom: spacing[2] }}>{p.description}</div>}
          {p.hasIngress && (
            <div style={ruleSection}>
              <div style={ruleSectionTitle}>Ingress Rules</div>
              {(p.ingressRules || []).map((r, i) => (
                <div key={i} style={ruleRow}>
                  <span style={{ color: colors.greenText }}>ALLOW</span> <span style={rulePortsText}>{r.ports.join(', ')}</span> from <span style={rulePeersText}>{r.peers.join(', ')}</span>
                </div>
              ))}
              {(!p.ingressRules || p.ingressRules.length === 0) && <div style={ruleRow}><span style={{ color: colors.gray400 }}>No rule details available</span></div>}
            </div>
          )}
          {p.hasEgress && (
            <div style={ruleSection}>
              <div style={ruleSectionTitle}>Egress Rules</div>
              {(p.egressRules || []).map((r, i) => (
                <div key={i} style={ruleRow}>
                  <span style={{ color: colors.orange600 }}>ALLOW</span> <span style={rulePortsText}>{r.ports.join(', ')}</span> to <span style={rulePeersText}>{r.peers.join(', ')}</span>
                </div>
              ))}
              {(!p.egressRules || p.egressRules.length === 0) && <div style={ruleRow}><span style={{ color: colors.gray400 }}>No rule details available</span></div>}
            </div>
          )}
        </div>
      </td></tr>
    )}
  </>);
};

// ============================================================
// Helpers
// ============================================================

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return iso; }
}

const KV: React.FC<{ label: string; value: string }> = ({ label, value }) => (<>
  <span style={{ color: colors.gray400, fontSize: fontSize.xs, fontFamily: fonts.mono }}>{label}</span>
  <span style={{ color: colors.gray800, fontSize: fontSize.xs, fontFamily: fonts.mono, fontWeight: fontWeight.medium }}>{value}</span>
</>);

const Stat: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, fontSize: fontSize.sm, fontFamily: fonts.mono }}>
    <span style={{ color: color || colors.gray800, fontWeight: fontWeight.semibold }}>{value}</span>
    <span style={{ color: colors.gray400 }}>{label}</span>
  </span>
);

const Sep: React.FC = () => <span style={{ width: 1, height: 16, background: colors.gray200, flexShrink: 0 }} />;

// ============================================================
// Styles
// ============================================================

const rootStyle: React.CSSProperties = { ...panel, overflow: 'hidden', maxWidth: '100%', display: 'flex', flexDirection: 'column', height: '100%' };
const topBar: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2], paddingBottom: spacing[3], borderBottom: `1px solid ${colors.gray200}`, flexShrink: 0 };
const topLeft: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[3], flexWrap: 'wrap' };
const topRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[1], flexWrap: 'wrap' };
const appLabelS: React.CSSProperties = { fontFamily: fonts.mono, fontWeight: fontWeight.semibold, fontSize: fontSize.md, color: colors.gray800 };
const nsLabelS: React.CSSProperties = { fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.gray400 };
const pill = (active: boolean): React.CSSProperties => ({ padding: `2px ${spacing[2]}px`, border: `1px solid ${active ? colors.orange500 : colors.gray200}`, borderRadius: 4, background: active ? colors.orange500 : 'transparent', color: active ? '#fff' : colors.gray600, cursor: 'pointer', fontSize: fontSize.xs, fontWeight: fontWeight.medium, fontFamily: fonts.mono, textTransform: 'uppercase' as const, lineHeight: '20px' });
const tabBar: React.CSSProperties = { display: 'flex', gap: 0, borderBottom: `1px solid ${colors.gray200}`, marginTop: spacing[3], flexShrink: 0 };
const tab = (active: boolean): React.CSSProperties => ({ padding: `${spacing[2]}px ${spacing[4]}px`, border: 'none', borderBottom: active ? `2px solid ${colors.orange500}` : '2px solid transparent', background: 'transparent', color: active ? colors.gray800 : colors.gray400, fontWeight: active ? fontWeight.semibold : fontWeight.medium, fontSize: fontSize.sm, fontFamily: fonts.mono, cursor: 'pointer' });
const tabContent: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: spacing[3] };
const searchRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[3], marginBottom: spacing[3] };
const countLabel: React.CSSProperties = { fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray400, flexShrink: 0 };
const tableWrap: React.CSSProperties = { overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', borderSpacing: 0 };
const thStyle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.gray500, padding: `${spacing[2]}px ${spacing[2]}px`, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { fontSize: fontSize.sm, padding: `${spacing[1]}px ${spacing[2]}px`, borderBottom: `1px solid ${colors.gray100}`, fontFamily: fonts.mono, whiteSpace: 'nowrap' };
const ellipsisTd: React.CSSProperties = { ...tdStyle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const dropRowStyle: React.CSSProperties = { background: colors.redLight };
const linkStyle: React.CSSProperties = { fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.blueText, cursor: 'pointer', borderBottom: `1px dotted ${colors.blueText}` };
const filterableStyle: React.CSSProperties = { cursor: 'pointer', borderBottom: `1px dotted ${colors.gray300}` };
const policyChipRow: React.CSSProperties = { display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' };
const policyChipBase: React.CSSProperties = { display: 'inline-block', padding: '1px 6px', borderRadius: 2, fontSize: 10, fontFamily: fonts.mono, fontWeight: fontWeight.medium, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' };
const policyChipLink: React.CSSProperties = { ...policyChipBase, background: colors.blueLight, color: colors.blueText, border: `1px solid ${colors.blue}` };
const policyChipPlain: React.CSSProperties = { ...policyChipBase, background: colors.gray100, color: colors.gray600, border: `1px solid ${colors.gray200}` };
const dropCountLink: React.CSSProperties = { color: colors.redText, fontFamily: fonts.mono, fontSize: fontSize.sm, cursor: 'pointer', borderBottom: `1px dotted ${colors.redText}` };
const notice: React.CSSProperties = { padding: spacing[3], background: colors.gray50, border: `1px solid ${colors.gray200}`, borderRadius: 4, color: colors.gray500, fontSize: fontSize.sm };
const paginationRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing[3], paddingTop: spacing[3] };
const pageBtn: React.CSSProperties = { ...pill(false), opacity: 1 };
const pageLabelS: React.CSSProperties = { fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray500 };

// Expanded row styles
const expandedTd: React.CSSProperties = { padding: 0, borderBottom: `1px solid ${colors.gray200}` };
const expandedContent: React.CSSProperties = { padding: `${spacing[3]}px ${spacing[4]}px`, background: colors.gray50 };
const expandedGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `2px ${spacing[3]}px`, marginBottom: spacing[3] };

// Why dropped styles
const whyDropped: React.CSSProperties = { background: colors.redLight, border: `1px solid ${colors.red}`, borderRadius: 4, padding: spacing[3] };
const whyDroppedTitle: React.CSSProperties = { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.redText, marginBottom: spacing[2] };
const whyDroppedReason: React.CSSProperties = { fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.gray800, marginBottom: spacing[2] };
const whyDroppedDetail: React.CSSProperties = { fontSize: fontSize.sm, color: colors.gray600 };
const whyDroppedPolicy: React.CSSProperties = { marginTop: spacing[2], paddingLeft: spacing[3], borderLeft: `2px solid ${colors.red}` };
const ruleDetail: React.CSSProperties = { fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray500, marginTop: 2 };
const ruleExplanation: React.CSSProperties = { fontSize: fontSize.xs, color: colors.redText, marginTop: spacing[1], fontStyle: 'italic' };

// Policy rule detail styles
const ruleSection: React.CSSProperties = { marginBottom: spacing[2] };
const ruleSectionTitle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: spacing[1] };
const ruleRow: React.CSSProperties = { fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.gray700, padding: `2px 0`, borderBottom: `1px solid ${colors.gray200}` };
const rulePortsText: React.CSSProperties = { fontWeight: fontWeight.semibold, color: colors.gray800 };
const rulePeersText: React.CSSProperties = { color: colors.blueText };

// Allowed traffic styles
const allowedCard: React.CSSProperties = { border: `1px solid ${colors.gray200}`, borderRadius: 4, padding: spacing[3], background: colors.white };
const allowedCardHeader: React.CSSProperties = { marginBottom: spacing[2], paddingBottom: spacing[2], borderBottom: `1px solid ${colors.gray200}` };
const allowedGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing[4] };
const allowedLabel: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: spacing[1] };
const allowedRule: React.CSSProperties = { fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.gray700, padding: '2px 0' };
