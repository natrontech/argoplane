import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  DataTable,
  Cell,
  Button,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchAppMetrics, fetchPodBreakdown } from '../api';
import { MetricData, TimeSeriesMetric, TimeRange, PodMetric } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CustomQuery } from './CustomQuery';

interface AppViewProps {
  application: any;
}

const REFRESH_INTERVAL = 30_000;

export const AppMetricsView: React.FC<AppViewProps> = ({ application }) => {
  const [summary, setSummary] = React.useState<MetricData[]>([]);
  const [timeSeries, setTimeSeries] = React.useState<TimeSeriesMetric[]>([]);
  const [pods, setPods] = React.useState<PodMetric[]>([]);
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;

    const metricsP = fetchAppMetrics(namespace, timeRange, appNamespace, appName, project);
    const podsP = fetchPodBreakdown(namespace, appName, 'Deployment', appNamespace, appName, project)
      .catch(() => [] as PodMetric[]);

    Promise.all([metricsP, podsP])
      .then(([resp, podList]) => {
        setSummary(resp.summary || []);
        setTimeSeries(resp.timeSeries || []);
        setPods(podList || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, timeRange, appNamespace, appName, project]);

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
          Failed to load metrics: {error}
        </div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  if (summary.length === 0) {
    return <div style={panel}><EmptyState message="No metrics available. Is Prometheus running?" /></div>;
  }

  return (
    <div style={panel}>
      {/* Custom query at the top */}
      <CustomQuery
        namespace={namespace}
        appNamespace={appNamespace}
        appName={appName}
        project={project}
      />

      {/* Header */}
      <div style={headerRow}>
        <SectionHeader title="APPLICATION METRICS" />
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Summary cards */}
      <div style={cardGrid}>
        {summary.map((m) => (
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
              color={ts.name.includes('CPU') ? colors.orange500 : colors.blueSolid}
              height={180}
              timeRange={timeRange}
            />
          ))}
        </div>
      )}

      {/* Pod breakdown */}
      {pods.length > 0 && (
        <div style={{ marginTop: spacing[5] }}>
          <SectionHeader title="POD BREAKDOWN" />
          <DataTable columns={['Pod', 'CPU', 'Memory', 'Net RX', 'Net TX', 'Restarts']}>
            {pods.map((p, i) => (
              <tr key={p.pod}>
                <Cell isLast={i === pods.length - 1}>
                  <span style={{ color: colors.orange600 }}>{p.pod}</span>
                </Cell>
                <Cell isLast={i === pods.length - 1}>{p.cpu} m</Cell>
                <Cell isLast={i === pods.length - 1}>{p.memory} MiB</Cell>
                <Cell isLast={i === pods.length - 1}>{p.netRx} KB/s</Cell>
                <Cell isLast={i === pods.length - 1}>{p.netTx} KB/s</Cell>
                <Cell isLast={i === pods.length - 1}>
                  <span style={{ color: Number(p.restarts) > 0 ? colors.redText : colors.gray600 }}>
                    {p.restarts}
                  </span>
                </Cell>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </div>
  );
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[3],
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: spacing[3],
};

const chartGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: spacing[3],
  marginTop: spacing[5],
};
