import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetaRow,
  DataTable,
  Cell,
  StatusBadge,
  Tag,
  MetricCard,
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

interface AppViewProps {
  application: any;
  tree?: any;
}

const REFRESH_INTERVAL = 30_000;

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
];

export const AppNetworkingView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [policies, setPolicies] = React.useState<PolicySummary[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>('all');
  const [podFilter, setPodFilter] = React.useState('');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('5m');
  const [endpointsExpanded, setEndpointsExpanded] = React.useState(false);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // Extract resource refs from ArgoCD resource tree for ownership detection.
  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.namespace === namespace || !n.namespace)
      .map((n: any) => ({
        group: n.group || '',
        kind: n.kind,
        namespace: n.namespace || '',
        name: n.name,
      }));
  }, [tree, namespace]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;

    const policiesP = fetchPoliciesWithOwnership(namespace, resourceRefs, appNamespace, appName, project)
      .catch(() => [] as PolicySummary[]);
    const endpointsP = fetchEndpoints(namespace, appNamespace, appName, project)
      .catch(() => [] as EndpointSummary[]);
    const flowsP = fetchFlows(namespace, appNamespace, appName, project, timeRange, 200, verdictFilter, directionFilter)
      .catch(() => ({ flows: [], hubble: false } as FlowsResponse));

    Promise.all([policiesP, endpointsP, flowsP])
      .then(([pol, ep, fl]) => {
        setPolicies(pol);
        setEndpoints(ep);
        setFlowsResponse(fl);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, resourceRefs, timeRange, verdictFilter, directionFilter]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <div style={panel}><Loading /></div>;

  if (error) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>
          Failed to load networking data: {error}
        </div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  const flows = flowsResponse?.flows || [];
  const flowSummary = flowsResponse?.summary;
  const hubbleAvailable = flowsResponse?.hubble ?? false;

  // Client-side pod name filter.
  const filteredFlows = podFilter
    ? flows.filter((f) => {
        const q = podFilter.toLowerCase();
        return (
          f.sourcePod?.toLowerCase().includes(q) ||
          f.destPod?.toLowerCase().includes(q) ||
          f.sourceNamespace?.toLowerCase().includes(q) ||
          f.destNamespace?.toLowerCase().includes(q)
        );
      })
    : flows;

  const droppedCount = flowSummary?.dropped || 0;
  const errorCount = flowSummary?.error || 0;

  const appPolicies = policies.filter((p) => p.ownership === 'app');
  const platformPolicies = policies.filter((p) => p.ownership === 'platform');

  return (
    <div style={rootPanel}>
      <SectionHeader title="NETWORKING" />

      <MetaRow items={[
        { label: 'Namespace', value: namespace },
        { label: 'Application', value: appName },
        { label: 'Policies', value: String(policies.length) },
      ]} />

      {/* Flow Summary Bar */}
      {hubbleAvailable && flowSummary && (
        <div style={{ marginTop: spacing[4] }}>
          <div style={cardGrid}>
            <MetricCard label="Total Flows" value={String(flowSummary.total)} />
            <MetricCard label="Forwarded" value={String(flowSummary.forwarded)} />
            <MetricCard label="Dropped" value={String(droppedCount)} />
            <MetricCard label="Errors" value={String(errorCount)} />
          </div>
        </div>
      )}

      {/* Traffic Flows Section */}
      {hubbleAvailable && (
        <div style={{ marginTop: spacing[6] }}>
          <div style={headerRow}>
            <SectionHeader title="TRAFFIC FLOWS" />
          </div>

          {/* Filters */}
          <div style={filtersRow}>
            {/* Time range */}
            <div style={filterGroup}>
              {TIME_RANGES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTimeRange(t.value)}
                  style={filterBtn(timeRange === t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <span style={filterDivider} />

            {/* Verdict */}
            <div style={filterGroup}>
              {(['all', 'forwarded', 'dropped', 'error'] as VerdictFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVerdictFilter(v)}
                  style={filterBtn(verdictFilter === v)}
                >
                  {v}
                </button>
              ))}
            </div>

            <span style={filterDivider} />

            {/* Direction */}
            <div style={filterGroup}>
              {(['all', 'ingress', 'egress'] as DirectionFilter[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirectionFilter(d)}
                  style={filterBtn(directionFilter === d)}
                >
                  {d}
                </button>
              ))}
            </div>

            <span style={filterDivider} />

            {/* Pod search */}
            <Input
              value={podFilter}
              onChange={setPodFilter}
              placeholder="Filter by pod or namespace..."
              style={{ minWidth: 200, fontSize: fontSize.sm }}
            />
          </div>

          {filteredFlows.length > 0 ? (
            <div style={tableWrap}>
              <DataTable columns={['Time', 'Direction', 'Source', 'Destination', 'Protocol', 'Verdict']}>
                {filteredFlows.map((f, i) => (
                  <FlowRow key={i} flow={f} />
                ))}
              </DataTable>
            </div>
          ) : (
            <EmptyState message={`No flows recorded in the last ${timeRange}`} />
          )}
        </div>
      )}

      {!hubbleAvailable && flowsResponse && (
        <div style={hubbleNotice}>
          Hubble Relay is not configured. Enable it in your Cilium installation to see live traffic flows.
        </div>
      )}

      {/* Network Policies Section */}
      <div style={{ marginTop: spacing[6] }}>
        <SectionHeader title="NETWORK POLICIES" />

        {policies.length > 0 ? (
          <div style={tableWrap}>
            <DataTable columns={['Name', 'Scope', 'Owner', 'Selector', 'Ingress', 'Egress', 'Created']}>
              {appPolicies.map((p) => (
                <PolicyRow key={`app-${p.scope}-${p.name}`} policy={p} />
              ))}
              {platformPolicies.map((p) => (
                <PolicyRow key={`plat-${p.scope}-${p.name}`} policy={p} />
              ))}
            </DataTable>
          </div>
        ) : (
          <EmptyState message={`No network policies found in ${namespace}`} />
        )}

        {platformPolicies.length > 0 && (
          <div style={platformHint}>
            Platform policies are managed outside this application. Contact your platform team to modify them.
          </div>
        )}
      </div>

      {/* Endpoints Section (collapsible) */}
      <div style={{ marginTop: spacing[6] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], cursor: 'pointer' }} onClick={() => setEndpointsExpanded(!endpointsExpanded)}>
          <SectionHeader title={`CILIUM ENDPOINTS (${endpoints.length})`} />
          <span style={{ color: colors.gray400, fontSize: fontSize.sm, userSelect: 'none' }}>
            {endpointsExpanded ? '\u25BC' : '\u25B6'}
          </span>
        </div>

        {endpointsExpanded && endpoints.length > 0 && (
          <div style={tableWrap}>
            <DataTable columns={['Pod', 'IP', 'Identity', 'Ingress Policy', 'Egress Policy', 'State']}>
              {endpoints.map((ep) => (
              <tr key={ep.name}>
                <Cell>{ep.name}</Cell>
                <Cell>{ep.ipv4 || ep.ipv6 || '-'}</Cell>
                <Cell>{ep.identityId || '-'}</Cell>
                <Cell mono={false}>
                  <StatusBadge
                    status={ep.ingressEnforcement === 'true' ? 'healthy' : 'degraded'}
                    label={ep.ingressEnforcement === 'true' ? 'enforced' : 'none'}
                  />
                </Cell>
                <Cell mono={false}>
                  <StatusBadge
                    status={ep.egressEnforcement === 'true' ? 'healthy' : 'degraded'}
                    label={ep.egressEnforcement === 'true' ? 'enforced' : 'none'}
                  />
                </Cell>
                <Cell mono={false}>
                  <StatusBadge
                    status={ep.state === 'ready' ? 'healthy' : ep.state === 'disconnected' ? 'failed' : 'in-progress'}
                    label={ep.state || 'unknown'}
                  />
                </Cell>
                </tr>
              ))}
            </DataTable>
          </div>
        )}

        {endpointsExpanded && endpoints.length === 0 && (
          <EmptyState message={`No Cilium endpoints found in ${namespace}`} />
        )}
      </div>
    </div>
  );
};

// --- Sub-components ---

const FlowRow: React.FC<{ flow: FlowSummary }> = ({ flow }) => {
  const verdictStatus = flow.verdict === 'FORWARDED'
    ? 'healthy'
    : flow.verdict === 'DROPPED'
      ? 'failed'
      : 'degraded';

  const verdictLabel = flow.verdict === 'DROPPED' && flow.dropReason
    ? `${flow.verdict} (${flow.dropReason})`
    : flow.verdict;

  const source = flow.sourcePod
    ? `${flow.sourceNamespace}/${flow.sourcePod}`
    : flow.sourceIP || '-';

  const dest = flow.destPod
    ? `${flow.destNamespace}/${flow.destPod}`
    : flow.destDNS || flow.destIP || '-';

  const protocol = flow.destPort > 0
    ? `${flow.protocol}:${flow.destPort}`
    : flow.protocol || '-';

  const directionTag = flow.direction === 'INGRESS'
    ? 'green'
    : flow.direction === 'EGRESS'
      ? 'orange'
      : 'gray';

  const timeStr = flow.time
    ? new Date(flow.time).toLocaleTimeString()
    : '-';

  return (
    <tr style={flow.verdict === 'DROPPED' ? droppedRowStyle : undefined}>
      <Cell>{timeStr}</Cell>
      <Cell mono={false}>
        <Tag variant={directionTag as any}>{flow.direction || 'UNKNOWN'}</Tag>
      </Cell>
      <Cell>{source}</Cell>
      <Cell>{dest}</Cell>
      <Cell>{protocol}</Cell>
      <Cell mono={false}>
        <StatusBadge status={verdictStatus as any} label={verdictLabel} />
      </Cell>
    </tr>
  );
};

const PolicyRow: React.FC<{ policy: PolicySummary }> = ({ policy }) => {
  const selectorLabels = policy.endpointSelector
    ? Object.entries(policy.endpointSelector).map(([k, v]) => `${k}=${v}`).join(', ')
    : 'all endpoints';

  return (
    <tr>
      <Cell>{policy.name}</Cell>
      <Cell mono={false}>
        <Tag variant={policy.scope === 'clusterwide' ? 'orange' : 'gray'}>{policy.scope}</Tag>
      </Cell>
      <Cell mono={false}>
        <Tag variant={policy.ownership === 'app' ? 'green' : 'gray'}>
          {policy.ownership === 'app' ? 'This App' : 'Platform'}
        </Tag>
      </Cell>
      <Cell>{selectorLabels}</Cell>
      <Cell mono={false}>
        {policy.hasIngress ? (
          <Tag variant="green">{policy.ingressRuleCount} rule{policy.ingressRuleCount !== 1 ? 's' : ''}</Tag>
        ) : (
          <span style={{ color: colors.gray400 }}>-</span>
        )}
      </Cell>
      <Cell mono={false}>
        {policy.hasEgress ? (
          <Tag variant="green">{policy.egressRuleCount} rule{policy.egressRuleCount !== 1 ? 's' : ''}</Tag>
        ) : (
          <span style={{ color: colors.gray400 }}>-</span>
        )}
      </Cell>
      <Cell>{new Date(policy.creationTimestamp).toLocaleDateString()}</Cell>
    </tr>
  );
};

// --- Styles ---

const rootPanel: React.CSSProperties = {
  ...panel,
  overflow: 'hidden',
  maxWidth: '100%',
};

const tableWrap: React.CSSProperties = {
  overflowX: 'auto',
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[2],
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: spacing[3],
};

const filtersRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  marginBottom: spacing[3],
  flexWrap: 'wrap',
};

const filterGroup: React.CSSProperties = {
  display: 'flex',
  gap: spacing[1],
};

const filterBtn = (active: boolean): React.CSSProperties => ({
  padding: `${spacing[1]}px ${spacing[3]}px`,
  border: `1px solid ${active ? colors.orange500 : colors.gray200}`,
  borderRadius: 4,
  background: active ? colors.orange500 : 'transparent',
  color: active ? '#fff' : colors.gray800,
  cursor: 'pointer',
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  textTransform: 'uppercase' as const,
});

const filterDivider: React.CSSProperties = {
  width: 1,
  height: 20,
  background: colors.gray200,
};

const droppedRowStyle: React.CSSProperties = {
  background: colors.redLight,
};

const hubbleNotice: React.CSSProperties = {
  marginTop: spacing[6],
  padding: spacing[4],
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  color: colors.gray500,
  fontSize: fontSize.sm,
};

const platformHint: React.CSSProperties = {
  marginTop: spacing[3],
  padding: `${spacing[2]}px ${spacing[3]}px`,
  background: colors.blueLight,
  border: `1px solid ${colors.blue}`,
  borderRadius: 4,
  color: colors.blueText,
  fontSize: fontSize.sm,
  fontFamily: fonts.body,
};
