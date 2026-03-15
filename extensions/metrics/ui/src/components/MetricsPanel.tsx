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
import { fetchMetrics, fetchTimeSeriesMetrics } from '../api';
import { ExtensionProps, MetricData, TimeSeriesMetric, TimeRange } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';

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

  const fetchAll = React.useCallback(() => {
    if (!namespace || !name) return;

    const instantPromise = fetchMetrics(namespace, name, kind, appNamespace, appName, project);
    const rangePromise = fetchTimeSeriesMetrics(namespace, name, kind, timeRange, appNamespace, appName, project);

    Promise.all([instantPromise, rangePromise])
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

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div style={{ ...panel, color: colors.red }}>
        <div style={{ marginBottom: spacing[2] }}>Failed to load metrics: {error}</div>
        <button
          onClick={() => { setLoading(true); fetchAll(); }}
          style={{
            background: 'none',
            border: `1px solid ${colors.gray300}`,
            borderRadius: 4,
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: 13,
            color: colors.gray600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (metrics.length === 0 && timeSeries.length === 0) {
    return <EmptyState message={`No metrics available for ${kind} ${namespace}/${name}`} />;
  }

  return (
    <div style={panel}>
      <SectionHeader
        title="METRICS"
        action={<TimeRangeSelector value={timeRange} onChange={setTimeRange} />}
      />

      <MetaRow items={[
        { label: 'Kind', value: kind },
        { label: 'Namespace', value: namespace },
        { label: 'Resource', value: name },
      ]} />

      {/* Instant metric cards */}
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

      {/* Time series charts */}
      {timeSeries.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: spacing[3],
          marginTop: spacing[4],
        }}>
          {timeSeries.map((ts) => (
            <SparklineChart
              key={ts.name}
              title={ts.name}
              unit={ts.unit}
              data={ts.series}
              color={CHART_COLORS[ts.name] || colors.orange500}
              height={140}
              timeRange={timeRange}
            />
          ))}
        </div>
      )}
    </div>
  );
};
