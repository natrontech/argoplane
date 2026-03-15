import * as React from 'react';
import {
  Loading,
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
  radius,
  panel,
} from '@argoplane/shared';
import { fetchAppMetrics, fetchPodBreakdown } from '../api';
import { MetricData, TimeSeriesMetric, TimeRange, PodMetric } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';
import { CustomQuery } from './CustomQuery';

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

const REFRESH_INTERVAL = 30_000;

export const MetricsStatusPanel: React.FC<StatusPanelProps> = ({ application, openFlyout }) => {
  const [summary, setSummary] = React.useState<MetricData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  React.useEffect(() => {
    if (!namespace) return;

    fetchAppMetrics(namespace, undefined, appNamespace, appName, project)
      .then((resp) => {
        setSummary(resp.summary || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      fetchAppMetrics(namespace, undefined, appNamespace, appName, project)
        .then((resp) => setSummary(resp.summary || []))
        .catch(() => {});
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [namespace, appNamespace, appName, project]);

  if (loading) {
    return <span style={compactWrap}>...</span>;
  }

  if (error || summary.length === 0) {
    return null;
  }

  const cpu = summary.find((m) => m.name === 'CPU Usage');
  const mem = summary.find((m) => m.name === 'Memory Usage');

  return (
    <div onClick={openFlyout} style={compactWrap} title="View metrics">
      <div style={metricChip}>
        <span style={chipIcon}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="5" width="2" height="4" fill={colors.orange400} />
            <rect x="4" y="3" width="2" height="6" fill={colors.orange500} />
            <rect x="7" y="1" width="2" height="8" fill={colors.orange600} />
          </svg>
        </span>
        <span style={chipValue}>{cpu?.value || '-'}</span>
        <span style={chipUnit}>{cpu?.unit || 'cpu'}</span>
      </div>
      <span style={divider} />
      <div style={metricChip}>
        <span style={chipValue}>{mem?.value || '-'}</span>
        <span style={chipUnit}>{mem?.unit || 'mem'}</span>
      </div>
    </div>
  );
};

// Flyout: full app metrics with pod breakdown and custom query
export const MetricsFlyout: React.FC<{ application: any }> = ({ application }) => {
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
    // For pod breakdown, we use the app name as a broad selector
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

  if (loading) {
    return <div style={flyoutContainer}><Loading /></div>;
  }

  if (error) {
    return (
      <div style={flyoutContainer}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>
          Failed to load metrics: {error}
        </div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <div style={flyoutContainer}>
      {/* Header */}
      <div style={flyoutHeader}>
        <h3 style={flyoutTitle}>{appName}</h3>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Summary cards */}
      <div style={summaryGrid}>
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

      {/* Pod breakdown table */}
      {pods.length > 0 && (
        <div style={{ marginTop: spacing[5] }}>
          <SectionHeader title="POD BREAKDOWN" />
          <DataTable columns={['Pod', 'CPU', 'Memory', 'Restarts']}>
            {pods.map((p, i) => (
              <tr key={p.pod}>
                <Cell isLast={i === pods.length - 1}>
                  <span style={{ color: colors.orange600 }}>{p.pod}</span>
                </Cell>
                <Cell isLast={i === pods.length - 1}>{p.cpu} m</Cell>
                <Cell isLast={i === pods.length - 1}>{p.memory} MiB</Cell>
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

      {/* Custom query */}
      <CustomQuery
        namespace={namespace}
        appNamespace={appNamespace}
        appName={appName}
        project={project}
      />
    </div>
  );
};

// --- Compact status panel styles ---

const compactWrap: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  padding: '2px 0',
};

const metricChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
};

const chipIcon: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  marginRight: 2,
};

const chipValue: React.CSSProperties = {
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
};

const chipUnit: React.CSSProperties = {
  fontSize: fontSize.xs,
  color: colors.gray400,
};

const divider: React.CSSProperties = {
  width: 1,
  height: 12,
  background: colors.gray300,
};

// --- Flyout styles ---

const flyoutContainer: React.CSSProperties = {
  padding: spacing[5],
  maxWidth: 720,
};

const flyoutHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[4],
};

const flyoutTitle: React.CSSProperties = {
  fontSize: fontSize.lg,
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
  margin: 0,
  fontFamily: fonts.mono,
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: spacing[3],
};

const chartGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: spacing[3],
  marginTop: spacing[5],
};
