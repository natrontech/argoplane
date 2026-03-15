import * as React from 'react';
import {
  Loading,
  EmptyState,
  MetricCard,
  MetaRow,
  Button,
  colors,
  panel,
  spacing,
} from '@argoplane/shared';
import { fetchMetrics, fetchTimeSeriesMetrics } from '../api';
import { ExtensionProps, MetricData, TimeSeriesMetric, TimeRange } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';
import { PodBreakdown } from './PodBreakdown';

const CHART_COLORS: Record<string, string> = {
  'CPU Usage': colors.orange500,
  'Memory Usage': colors.blueSolid,
  'Network RX': colors.greenSolid,
  'Network TX': colors.yellowSolid,
};

const REFRESH_INTERVAL = 30_000;

export const MetricsPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [metrics, setMetrics] = React.useState<MetricData[]>([]);
  const [timeSeries, setTimeSeries] = React.useState<TimeSeriesMetric[]>([]);
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || 'Deployment';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const showPodBreakdown = kind === 'Deployment' || kind === 'StatefulSet';

  const fetchAll = React.useCallback(() => {
    if (!namespace || !name) return;

    const instantP = fetchMetrics(namespace, name, kind, appNamespace, appName, project);
    const rangeP = fetchTimeSeriesMetrics(namespace, name, kind, timeRange, appNamespace, appName, project);

    Promise.all([instantP, rangeP])
      .then(([instant, series]) => {
        setMetrics(instant);
        setTimeSeries(series);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, name, kind, timeRange, appNamespace, appName, project]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <Loading />;

  if (error) {
    return (
      <div style={{ ...panel, color: colors.red }}>
        <div style={{ marginBottom: spacing[2] }}>Failed to load metrics: {error}</div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  if (metrics.length === 0 && timeSeries.length === 0) {
    return <EmptyState message={`No metrics available for ${kind} ${namespace}/${name}`} />;
  }

  return (
    <div style={panel}>
      {/* Header */}
      <div style={headerRow}>
        <MetaRow items={[
          { label: 'Kind', value: kind },
          { label: 'Namespace', value: namespace },
          { label: 'Resource', value: name },
        ]} />
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Summary cards */}
      <div style={cardGrid}>
        {metrics.map((m) => (
          <MetricCard key={m.name} label={m.name} value={m.value} unit={m.unit} />
        ))}
      </div>

      {/* Charts */}
      {timeSeries.length > 0 && (
        <div style={chartGrid}>
          {timeSeries.map((ts) => (
            <SparklineChart
              key={ts.name}
              title={ts.name}
              unit={ts.unit}
              data={ts.series}
              color={CHART_COLORS[ts.name] || colors.orange500}
              height={180}
              timeRange={timeRange}
            />
          ))}
        </div>
      )}

      {/* Pod breakdown */}
      {showPodBreakdown && (
        <PodBreakdown
          namespace={namespace}
          name={name}
          kind={kind}
          appNamespace={appNamespace}
          appName={appName}
          project={project}
        />
      )}
    </div>
  );
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[4],
  flexWrap: 'wrap',
  gap: spacing[2],
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: spacing[3],
};

const chartGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: spacing[3],
  marginTop: spacing[5],
};
