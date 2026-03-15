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
  Card,
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
  PolicySummary,
  EndpointSummary,
  IdentitySummary,
} from '../api';

interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}

export const NetworkingPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [policies, setPolicies] = React.useState<PolicySummary[]>([]);
  const [clusterPolicies, setClusterPolicies] = React.useState<PolicySummary[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [identities, setIdentities] = React.useState<IdentitySummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
    ])
      .then(([pol, cpol, ep, id]) => {
        setPolicies(pol);
        setClusterPolicies(cpol);
        setEndpoints(ep);
        setIdentities(id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project]);

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
        <MetricCard label="Namespace Policies" value={String(policies.length)} />
        <MetricCard label="Clusterwide Policies" value={String(clusterPolicies.length)} />
        <MetricCard label="Endpoints" value={String(endpoints.length)} />
        <MetricCard label="Policy Enforced" value={String(enforcedEndpoints)} />
        <MetricCard label="Identities" value={String(identities.length)} />
      </div>

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

      {totalPolicies === 0 && endpoints.length === 0 && (
        <EmptyState message={`No Cilium networking data found in ${namespace}`} />
      )}
    </div>
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
