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
  colors,
  panel,
  spacing,
} from '@argoplane/shared';
import {
  fetchPolicies,
  fetchClusterwidePolicies,
  fetchEndpoints,
  fetchIdentities,
  fetchFlows,
  PolicySummary,
  EndpointSummary,
  IdentitySummary,
  FlowSummary,
  FlowsResponse,
} from '../api';

interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}

type VerdictFilter = 'all' | 'forwarded' | 'dropped' | 'error';

export const NetworkingPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [policies, setPolicies] = React.useState<PolicySummary[]>([]);
  const [clusterPolicies, setClusterPolicies] = React.useState<PolicySummary[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [identities, setIdentities] = React.useState<IdentitySummary[]>([]);
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  React.useEffect(() => {
    if (!namespace) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchPolicies(namespace, appNamespace, appName, project),
      fetchClusterwidePolicies(appNamespace, appName, project),
      fetchEndpoints(namespace, appNamespace, appName, project),
      fetchIdentities(namespace, appNamespace, appName, project),
      fetchFlows(namespace, appNamespace, appName, project, '5m', 100, verdictFilter),
    ])
      .then(([pol, cpol, ep, id, flows]) => {
        setPolicies(pol);
        setClusterPolicies(cpol);
        setEndpoints(ep);
        setIdentities(id);
        setFlowsResponse(flows);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, verdictFilter]);

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div style={{ ...panel, color: colors.red }}>
        Failed to load networking data: {error}
      </div>
    );
  }

  const totalPolicies = policies.length + clusterPolicies.length;
  const enforcedEndpoints = endpoints.filter(
    (ep) => ep.ingressEnforcement === 'true' || ep.egressEnforcement === 'true'
  ).length;

  const flows = flowsResponse?.flows || [];
  const flowSummary = flowsResponse?.summary;
  const hubbleAvailable = flowsResponse?.hubble ?? false;

  return (
    <div style={panel}>
      <SectionHeader title="NETWORKING" />

      <MetaRow items={[
        { label: 'Namespace', value: namespace },
        { label: 'Resource', value: name },
      ]} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: spacing[3],
        marginTop: spacing[4],
      }}>
        <MetricCard label="Network Policies" value={String(totalPolicies)} />
        <MetricCard label="Endpoints" value={String(endpoints.length)} />
        <MetricCard label="Policy Enforced" value={String(enforcedEndpoints)} />
        <MetricCard label="Identities" value={String(identities.length)} />
      </div>

      {/* Traffic Flows Section */}
      {hubbleAvailable && (
        <div style={{ marginTop: spacing[6] }}>
          <SectionHeader title="TRAFFIC FLOWS" />

          {flowSummary && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: spacing[3],
              marginTop: spacing[3],
            }}>
              <MetricCard label="Total Flows" value={String(flowSummary.total)} />
              <MetricCard label="Forwarded" value={String(flowSummary.forwarded)} />
              <MetricCard label="Dropped" value={String(flowSummary.dropped)} />
              <MetricCard label="Errors" value={String(flowSummary.error)} />
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: spacing[2],
            marginTop: spacing[4],
            marginBottom: spacing[3],
          }}>
            {(['all', 'forwarded', 'dropped', 'error'] as VerdictFilter[]).map((v) => (
              <button
                key={v}
                onClick={() => setVerdictFilter(v)}
                style={{
                  padding: `${spacing[1]} ${spacing[3]}`,
                  border: `1px solid ${verdictFilter === v ? colors.orange500 : colors.gray200}`,
                  borderRadius: '4px',
                  background: verdictFilter === v ? colors.orange500 : 'transparent',
                  color: verdictFilter === v ? '#fff' : colors.gray800,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase' as const,
                }}
              >
                {v}
              </button>
            ))}
          </div>

          {flows.length > 0 ? (
            <DataTable columns={['Time', 'Direction', 'Source', 'Destination', 'Protocol', 'Verdict']}>
              {flows.map((f, i) => (
                <FlowRow key={i} flow={f} />
              ))}
            </DataTable>
          ) : (
            <EmptyState message="No flows recorded in the last 5 minutes" />
          )}
        </div>
      )}

      {!hubbleAvailable && flowsResponse && (
        <div style={{
          marginTop: spacing[6],
          padding: spacing[4],
          background: colors.gray50,
          border: `1px solid ${colors.gray200}`,
          borderRadius: '4px',
          color: colors.gray500,
          fontSize: '13px',
        }}>
          Hubble Relay is not configured. Enable it in your Cilium installation to see live traffic flows.
        </div>
      )}

      {/* Policies Section */}
      {totalPolicies > 0 && (
        <div style={{ marginTop: spacing[6] }}>
          <SectionHeader title="CILIUM NETWORK POLICIES" />
          <DataTable columns={['Name', 'Scope', 'Selector', 'Ingress', 'Egress', 'Created']}>
            {policies.map((p) => (
              <PolicyRow key={`ns-${p.name}`} policy={p} scope="namespace" />
            ))}
            {clusterPolicies.map((p) => (
              <PolicyRow key={`cluster-${p.name}`} policy={p} scope="clusterwide" />
            ))}
          </DataTable>
        </div>
      )}

      {/* Endpoints Section */}
      {endpoints.length > 0 && (
        <div style={{ marginTop: spacing[6] }}>
          <SectionHeader title="CILIUM ENDPOINTS" />
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

      {/* Identities Section */}
      {identities.length > 0 && (
        <div style={{ marginTop: spacing[6] }}>
          <SectionHeader title="SECURITY IDENTITIES" />
          <DataTable columns={['Identity', 'Labels']}>
            {identities.map((id) => (
              <tr key={id.id}>
                <Cell>{id.id}</Cell>
                <Cell mono={false}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing[1] }}>
                    {Object.entries(id.labels).map(([k, v]) => (
                      <Tag key={k} variant="gray">{k}={v}</Tag>
                    ))}
                  </div>
                </Cell>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {totalPolicies === 0 && endpoints.length === 0 && !hubbleAvailable && (
        <EmptyState message={`No Cilium networking data found in ${namespace}`} />
      )}
    </div>
  );
};

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
    <tr>
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

const PolicyRow: React.FC<{ policy: PolicySummary; scope: string }> = ({ policy, scope }) => {
  const selectorLabels = policy.endpointSelector
    ? Object.entries(policy.endpointSelector).map(([k, v]) => `${k}=${v}`).join(', ')
    : 'all endpoints';

  return (
    <tr>
      <Cell>{policy.name}</Cell>
      <Cell mono={false}>
        <Tag variant={scope === 'clusterwide' ? 'orange' : 'gray'}>{scope}</Tag>
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
