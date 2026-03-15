import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  MetaRow,
  colors,
  panel,
  spacing,
} from '@argoplane/shared';
import { fetchMetrics } from '../api';

interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}

interface MetricData {
  name: string;
  value: string;
  unit: string;
}

export const MetricsPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [metrics, setMetrics] = React.useState<MetricData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  React.useEffect(() => {
    if (!namespace || !name) return;

    setLoading(true);
    fetchMetrics(namespace, name, appNamespace, appName, project)
      .then(setMetrics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, name, appNamespace, appName, project]);

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div style={{ ...panel, color: colors.red }}>
        Failed to load metrics: {error}
      </div>
    );
  }

  if (metrics.length === 0) {
    return <EmptyState message={`No metrics available for ${namespace}/${name}`} />;
  }

  return (
    <div style={panel}>
      <SectionHeader title="METRICS" />

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
        {metrics.map((m) => (
          <MetricCard
            key={m.name}
            label={m.name}
            value={m.value}
            unit={m.unit}
          />
        ))}
      </div>
    </div>
  );
};
