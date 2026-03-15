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
  EndpointSummary,
  FlowSummary,
  FlowsResponse,
  ResourceRef,
  VerdictFilter,
  DirectionFilter,
  TimeRange,
} from '../types';

// ============================================================
// ArgoCD resource linking
// ============================================================

function resourceNodeUrl(
  appNamespace: string,
  appName: string,
  group: string,
  kind: string,
  namespace: string,
  name: string,
): string {
  const nodeKey = `${group}/${kind}/${namespace}/${name}/0`;
  const base = `/applications/${appNamespace}/${appName}`;
  const params = new URLSearchParams({ node: nodeKey });
  return `${base}?${params.toString()}`;
}

function podUrl(appNs: string, appName: string, podNamespace: string, podName: string): string {
  return resourceNodeUrl(appNs, appName, '', 'Pod', podNamespace, podName);
}

function policyUrl(appNs: string, appName: string, policy: PolicySummary): string {
  if (policy.scope === 'clusterwide') {
    return resourceNodeUrl(appNs, appName, 'cilium.io', 'CiliumClusterwideNetworkPolicy', '', policy.name);
  }
  return resourceNodeUrl(appNs, appName, 'cilium.io', 'CiliumNetworkPolicy', policy.namespace || '', policy.name);
}

// ============================================================
// Policy-to-flow matching
// ============================================================

function findMatchingPolicies(
  flow: FlowSummary,
  policies: PolicySummary[],
  endpoints: EndpointSummary[],
): PolicySummary[] {
  if (flow.verdict !== 'DROPPED') return [];

  // Determine which pod the policy should select.
  // For ingress drops: the dest pod is being blocked from receiving.
  // For egress drops: the source pod is being blocked from sending.
  const targetPod = flow.direction === 'INGRESS' ? flow.destPod : flow.sourcePod;
  const targetNs = flow.direction === 'INGRESS' ? flow.destNamespace : flow.sourceNamespace;
  if (!targetPod) return [];

  // Find the endpoint for this pod to get its labels.
  const ep = endpoints.find((e) => e.name === targetPod && e.namespace === targetNs);
  const podLabels = ep?.labels || {};

  return policies.filter((p) => {
    // Direction match: ingress drop needs ingress rules, egress drop needs egress rules.
    if (flow.direction === 'INGRESS' && !p.hasIngress) return false;
    if (flow.direction === 'EGRESS' && !p.hasEgress) return false;

    // Namespace match for namespace-scoped policies.
    if (p.scope === 'namespace' && p.namespace && p.namespace !== targetNs) return false;

    // Selector match: if policy has an endpointSelector, check against pod labels.
    if (p.endpointSelector && Object.keys(p.endpointSelector).length > 0) {
      return Object.entries(p.endpointSelector).every(
        ([k, v]) => podLabels[`k8s:${k}`] === v || podLabels[k] === v,
      );
    }

    // No selector (selects all pods in namespace).
    return true;
  });
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
    let av: string | number;
    let bv: string | number;
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
// Shared sub-components
// ============================================================

const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
  const v = verdict.toUpperCase();
  const variant = v === 'FORWARDED' ? 'green' : v === 'DROPPED' ? 'red' : 'gray';
  return <Tag variant={variant}>{v === 'FORWARDED' ? 'FWD' : v === 'DROPPED' ? 'DROP' : v}</Tag>;
};

const DirectionBadge: React.FC<{ direction: string }> = ({ direction }) => {
  const d = direction.toUpperCase();
  return (
    <span style={{
      fontSize: fontSize.xs,
      fontFamily: fonts.mono,
      fontWeight: fontWeight.medium,
      color: d === 'INGRESS' ? colors.blueText : colors.orange600,
    }}>
      {d === 'INGRESS' ? 'IN' : d === 'EGRESS' ? 'OUT' : d}
    </span>
  );
};

const SortableHeader: React.FC<{
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
}> = ({ label, field, currentField, currentDir, onSort }) => {
  const active = currentField === field;
  const arrow = active ? (currentDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
  return (
    <th
      style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(field)}
    >
      {label}{arrow}
    </th>
  );
};

/** Clickable resource link styled as inline monospace text. */
const ResourceLink: React.FC<{
  href: string;
  children: React.ReactNode;
  title?: string;
  color?: string;
}> = ({ href, children, title, color }) => (
  <a
    href={href}
    title={title}
    style={{
      ...linkStyle,
      color: color || colors.blueText,
    }}
  >
    {children}
  </a>
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
  const [activeTab, setActiveTab] = React.useState<'flows' | 'policies'>('flows');

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.namespace === namespace || !n.namespace)
      .map((n: any) => ({ group: n.group || '', kind: n.kind, namespace: n.namespace || '', name: n.name }));
  }, [tree, namespace]);

  // Build a Set of tree node keys for fast "is this resource in our app?" checks.
  const treeNodeKeys = React.useMemo(() => {
    const keys = new Set<string>();
    if (!tree?.nodes) return keys;
    for (const n of tree.nodes) {
      keys.add(`${n.group || ''}/${n.kind}/${n.namespace || ''}/${n.name}`);
    }
    return keys;
  }, [tree]);

  const isPodInTree = React.useCallback((podNs: string, podName: string) => {
    return treeNodeKeys.has(`/Pod/${podNs}/${podName}`);
  }, [treeNodeKeys]);

  const isPolicyInTree = React.useCallback((policy: PolicySummary) => {
    if (policy.scope === 'clusterwide') {
      return treeNodeKeys.has(`cilium.io/CiliumClusterwideNetworkPolicy//${policy.name}`);
    }
    return treeNodeKeys.has(`cilium.io/CiliumNetworkPolicy/${policy.namespace || ''}/${policy.name}`);
  }, [treeNodeKeys]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;
    const policiesP = fetchPoliciesWithOwnership(namespace, resourceRefs, appNamespace, appName, project).catch(() => [] as PolicySummary[]);
    const endpointsP = fetchEndpoints(namespace, appNamespace, appName, project).catch(() => [] as EndpointSummary[]);
    const flowsP = fetchFlows(namespace, appNamespace, appName, project, timeRange, 500, verdictFilter, directionFilter).catch(() => ({ flows: [], hubble: false } as FlowsResponse));

    Promise.all([policiesP, endpointsP, flowsP])
      .then(([pol, ep, fl]) => { setPolicies(pol); setEndpoints(ep); setFlowsResponse(fl); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, resourceRefs, timeRange, verdictFilter, directionFilter]);

  React.useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);
  React.useEffect(() => { const i = setInterval(fetchAll, REFRESH_INTERVAL); return () => clearInterval(i); }, [fetchAll]);

  // Reset page when filters change.
  React.useEffect(() => { setPage(0); }, [search, sortField, sortDir, verdictFilter, directionFilter, timeRange]);

  const flows = flowsResponse?.flows || [];
  const flowSummary = flowsResponse?.summary;
  const hubbleAvailable = flowsResponse?.hubble ?? false;

  // Client-side text filter.
  const filteredFlows = React.useMemo(() => {
    if (!search.trim()) return flows;
    const q = search.toLowerCase();
    return flows.filter((f) =>
      f.sourcePod.toLowerCase().includes(q) ||
      f.destPod.toLowerCase().includes(q) ||
      (f.sourceIP || '').toLowerCase().includes(q) ||
      (f.destIP || '').toLowerCase().includes(q) ||
      (f.destDNS || '').toLowerCase().includes(q) ||
      f.protocol.toLowerCase().includes(q) ||
      (f.dropReason || '').toLowerCase().includes(q) ||
      f.summary.toLowerCase().includes(q) ||
      f.sourceNamespace.toLowerCase().includes(q) ||
      f.destNamespace.toLowerCase().includes(q)
    );
  }, [flows, search]);

  const sortedFlows = React.useMemo(() => sortFlows(filteredFlows, sortField, sortDir), [filteredFlows, sortField, sortDir]);

  // Count dropped flows per policy for the policies tab.
  const policyDropCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    const droppedFlows = flows.filter((f) => f.verdict === 'DROPPED');
    for (const f of droppedFlows) {
      const matching = findMatchingPolicies(f, policies, endpoints);
      for (const p of matching) {
        const key = `${p.scope}-${p.name}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [flows, policies, endpoints]);

  const totalPages = Math.max(1, Math.ceil(sortedFlows.length / PAGE_SIZE));
  const pageFlows = sortedFlows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'time' ? 'desc' : 'asc');
    }
  };

  // Navigate to policies tab filtered by a specific policy name.
  const showPolicyInTab = (policyName: string) => {
    setActiveTab('policies');
    setSearch(policyName);
  };

  // Navigate to flows tab filtered by a pod name.
  const showFlowsForPod = (podName: string) => {
    setActiveTab('flows');
    setSearch(podName);
  };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      {/* === Top bar === */}
      <div style={topBar}>
        <div style={topLeft}>
          <span style={appLabel}>{appName}</span>
          <span style={nsLabel}>{namespace}</span>
          {hubbleAvailable && flowSummary && (
            <>
              <Sep />
              <Stat label="flows" value={flowSummary.total} />
              <Stat label="fwd" value={flowSummary.forwarded} color={colors.greenText} />
              <Stat label="drop" value={flowSummary.dropped} color={flowSummary.dropped > 0 ? colors.redText : undefined} />
              <Stat label="err" value={flowSummary.error} color={flowSummary.error > 0 ? colors.yellowText : undefined} />
            </>
          )}
        </div>
        <div style={topRight}>
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
      </div>

      {/* === Tabs === */}
      <div style={tabBar}>
        <button style={tab(activeTab === 'flows')} onClick={() => { setActiveTab('flows'); setSearch(''); }}>
          Flows {hubbleAvailable && `(${flows.length})`}
        </button>
        <button style={tab(activeTab === 'policies')} onClick={() => { setActiveTab('policies'); setSearch(''); }}>
          Policies ({policies.length})
        </button>
      </div>

      {/* === Flows tab === */}
      {activeTab === 'flows' && (
        <div style={tabContent}>
          {!hubbleAvailable && (
            <div style={notice}>Hubble Relay not configured. Enable it to see traffic flows.</div>
          )}

          {hubbleAvailable && (
            <>
              <div style={searchRow}>
                <Input
                  value={search}
                  onChange={setSearch}
                  placeholder="Filter by pod, IP, DNS, protocol, drop reason..."
                  style={{ flex: 1, maxWidth: 420 }}
                />
                <span style={countLabel}>{filteredFlows.length} flows</span>
              </div>

              {filteredFlows.length === 0 ? (
                <EmptyState message={search ? 'No flows match your search' : `No flows in the last ${timeRange}`} />
              ) : (
                <>
                  <div style={tableWrap}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <SortableHeader label="Time" field="time" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                          <SortableHeader label="Verdict" field="verdict" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                          <SortableHeader label="Dir" field="direction" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                          <SortableHeader label="Source" field="source" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                          <SortableHeader label="Destination" field="dest" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                          <SortableHeader label="Proto" field="protocol" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                          <SortableHeader label="Port" field="port" currentField={sortField} currentDir={sortDir} onSort={handleSort} />
                          <th style={thStyle}>Drop Reason</th>
                          <th style={thStyle}>Policy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageFlows.map((f, i) => (
                          <FlowRow
                            key={`${f.time}-${i}`}
                            flow={f}
                            namespace={namespace}
                            appNamespace={appNamespace}
                            appName={appName}
                            policies={policies}
                            endpoints={endpoints}
                            isPodInTree={isPodInTree}
                            isPolicyInTree={isPolicyInTree}
                            onPolicyClick={showPolicyInTab}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={paginationRow}>
                      <button style={pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
                      <span style={pageLabel}>{page + 1} / {totalPages}</span>
                      <button style={pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* === Policies tab === */}
      {activeTab === 'policies' && (
        <div style={tabContent}>
          {policies.length === 0 ? (
            <EmptyState message="No Cilium network policies found" />
          ) : (
            <div style={tableWrap}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Scope</th>
                    <th style={thStyle}>Owner</th>
                    <th style={thStyle}>Selector</th>
                    <th style={thStyle}>Ingress</th>
                    <th style={thStyle}>Egress</th>
                    <th style={thStyle}>Drops</th>
                    <th style={thStyle}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <PolicyRow
                      key={`${p.scope}-${p.name}`}
                      policy={p}
                      appNamespace={appNamespace}
                      appName={appName}
                      isPolicyInTree={isPolicyInTree}
                      dropCount={policyDropCounts.get(`${p.scope}-${p.name}`) || 0}
                      onDropCountClick={() => { setActiveTab('flows'); setVerdictFilter('dropped'); setSearch(''); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Row components
// ============================================================

const FlowRow: React.FC<{
  flow: FlowSummary;
  namespace: string;
  appNamespace: string;
  appName: string;
  policies: PolicySummary[];
  endpoints: EndpointSummary[];
  isPodInTree: (ns: string, name: string) => boolean;
  isPolicyInTree: (policy: PolicySummary) => boolean;
  onPolicyClick: (name: string) => void;
}> = ({ flow: f, namespace, appNamespace, appName, policies, endpoints, isPodInTree, isPolicyInTree, onPolicyClick }) => {
  const srcDisplay = f.sourcePod
    ? (f.sourceNamespace !== namespace ? `${f.sourceNamespace}/${f.sourcePod}` : f.sourcePod)
    : f.sourceIP || 'unknown';
  const dstDisplay = f.destPod
    ? (f.destNamespace !== namespace ? `${f.destNamespace}/${f.destPod}` : f.destPod)
    : f.destDNS || f.destIP || 'unknown';

  const srcLinkable = f.sourcePod && isPodInTree(f.sourceNamespace, f.sourcePod);
  const dstLinkable = f.destPod && isPodInTree(f.destNamespace, f.destPod);

  const isDrop = f.verdict === 'DROPPED';

  // Find matching policies for dropped flows.
  const matchingPolicies = React.useMemo(
    () => isDrop ? findMatchingPolicies(f, policies, endpoints) : [],
    [f, isDrop, policies, endpoints],
  );

  return (
    <tr style={isDrop ? dropRowStyle : undefined}>
      <td style={tdStyle}>{formatTime(f.time)}</td>
      <td style={tdStyle}><VerdictBadge verdict={f.verdict} /></td>
      <td style={tdStyle}><DirectionBadge direction={f.direction} /></td>
      <td style={ellipsisTd} title={srcDisplay}>
        {srcLinkable ? (
          <ResourceLink
            href={podUrl(appNamespace, appName, f.sourceNamespace, f.sourcePod)}
            title={`Open ${f.sourcePod} flows`}
          >
            {srcDisplay}
          </ResourceLink>
        ) : srcDisplay}
      </td>
      <td style={ellipsisTd} title={dstDisplay}>
        {dstLinkable ? (
          <ResourceLink
            href={podUrl(appNamespace, appName, f.destNamespace, f.destPod)}
            title={`Open ${f.destPod} flows`}
          >
            {dstDisplay}
          </ResourceLink>
        ) : dstDisplay}
      </td>
      <td style={tdStyle}>{f.protocol}</td>
      <td style={tdStyle}>{f.destPort || '-'}</td>
      <td style={{ ...tdStyle, color: f.dropReason ? colors.redText : colors.gray400 }}>
        {f.dropReason || '-'}
      </td>
      <td style={tdStyle}>
        {matchingPolicies.length > 0 ? (
          <div style={policyChipRow}>
            {matchingPolicies.slice(0, 2).map((p) => {
              const inTree = isPolicyInTree(p);
              return inTree ? (
                <a
                  key={p.name}
                  href={policyUrl(appNamespace, appName, p)}
                  style={policyChipLink}
                  title={`Open ${p.name} in resource tree`}
                >
                  {p.name}
                </a>
              ) : (
                <span
                  key={p.name}
                  style={policyChipPlain}
                  onClick={() => onPolicyClick(p.name)}
                  title={`View ${p.name} in policies tab`}
                >
                  {p.name}
                </span>
              );
            })}
            {matchingPolicies.length > 2 && (
              <span style={policyChipPlain}>+{matchingPolicies.length - 2}</span>
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
};

const PolicyRow: React.FC<{
  policy: PolicySummary;
  appNamespace: string;
  appName: string;
  isPolicyInTree: (policy: PolicySummary) => boolean;
  dropCount: number;
  onDropCountClick: () => void;
}> = ({ policy: p, appNamespace, appName, isPolicyInTree, dropCount, onDropCountClick }) => {
  const sel = p.endpointSelector
    ? Object.entries(p.endpointSelector).map(([k, v]) => `${k}=${v}`).join(', ')
    : 'all pods';
  const created = formatTime(p.creationTimestamp);
  const inTree = isPolicyInTree(p);

  return (
    <tr>
      <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>
        {inTree ? (
          <ResourceLink href={policyUrl(appNamespace, appName, p)} title={`Open ${p.name} in resource tree`}>
            {p.name}
          </ResourceLink>
        ) : (
          p.name
        )}
      </td>
      <td style={tdStyle}>
        <Tag variant={p.scope === 'clusterwide' ? 'orange' : 'gray'}>{p.scope}</Tag>
      </td>
      <td style={tdStyle}>
        <Tag variant={p.ownership === 'app' ? 'green' : 'gray'}>
          {p.ownership === 'app' ? 'App' : 'Platform'}
        </Tag>
      </td>
      <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sel}>{sel}</td>
      <td style={tdStyle}>
        {p.hasIngress ? <span style={{ color: colors.greenText }}>{p.ingressRuleCount} rules</span> : <span style={{ color: colors.gray400 }}>-</span>}
      </td>
      <td style={tdStyle}>
        {p.hasEgress ? <span style={{ color: colors.orange600 }}>{p.egressRuleCount} rules</span> : <span style={{ color: colors.gray400 }}>-</span>}
      </td>
      <td style={tdStyle}>
        {dropCount > 0 ? (
          <span style={dropCountLink} onClick={onDropCountClick} title="View dropped flows">
            {dropCount} drops
          </span>
        ) : (
          <span style={{ color: colors.gray400 }}>0</span>
        )}
      </td>
      <td style={tdStyle}>{created}</td>
    </tr>
  );
};

// ============================================================
// Helpers
// ============================================================

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

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

const rootStyle: React.CSSProperties = {
  ...panel,
  overflow: 'hidden',
  maxWidth: '100%',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const topBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: spacing[2],
  paddingBottom: spacing[3],
  borderBottom: `1px solid ${colors.gray200}`,
  flexShrink: 0,
};

const topLeft: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[3],
  flexWrap: 'wrap',
};

const topRight: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[1],
  flexWrap: 'wrap',
};

const appLabel: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontWeight: fontWeight.semibold,
  fontSize: fontSize.md,
  color: colors.gray800,
};

const nsLabel: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  color: colors.gray400,
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

const tabBar: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: `1px solid ${colors.gray200}`,
  marginTop: spacing[3],
  flexShrink: 0,
};

const tab = (active: boolean): React.CSSProperties => ({
  padding: `${spacing[2]}px ${spacing[4]}px`,
  border: 'none',
  borderBottom: active ? `2px solid ${colors.orange500}` : '2px solid transparent',
  background: 'transparent',
  color: active ? colors.gray800 : colors.gray400,
  fontWeight: active ? fontWeight.semibold : fontWeight.medium,
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
  cursor: 'pointer',
});

const tabContent: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  paddingTop: spacing[3],
};

const searchRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[3],
  marginBottom: spacing[3],
};

const countLabel: React.CSSProperties = {
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

const ellipsisTd: React.CSSProperties = {
  ...tdStyle,
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const dropRowStyle: React.CSSProperties = {
  background: colors.redLight,
};

const linkStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  textDecoration: 'none',
  cursor: 'pointer',
  borderBottom: `1px dotted currentColor`,
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

const dropCountLink: React.CSSProperties = {
  color: colors.redText,
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  cursor: 'pointer',
  borderBottom: `1px dotted ${colors.redText}`,
};

const notice: React.CSSProperties = {
  padding: spacing[3],
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  color: colors.gray500,
  fontSize: fontSize.sm,
};

const paginationRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing[3],
  paddingTop: spacing[3],
};

const pageBtn: React.CSSProperties = {
  ...pill(false),
  opacity: 1,
};

const pageLabel: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  color: colors.gray500,
};
