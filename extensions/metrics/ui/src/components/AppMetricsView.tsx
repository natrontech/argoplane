import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  DataTable,
  Cell,
  Button,
  StatusBadge,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  radius,
  panel,
} from '@argoplane/shared';
import { fetchAppMetrics, fetchPodBreakdown, fetchTimeSeriesMetrics } from '../api';
import { MetricData, TimeSeriesMetric, TimeRange, PodMetric } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';
import { QueryBuilder } from './QueryBuilder';

interface AppViewProps {
  application: any;
  tree?: any;
}

const REFRESH_INTERVAL = 30_000;

export const AppMetricsView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [summary, setSummary] = React.useState<MetricData[]>([]);
  const [timeSeries, setTimeSeries] = React.useState<TimeSeriesMetric[]>([]);
  const [pods, setPods] = React.useState<PodMetric[]>([]);
  const [podCharts, setPodCharts] = React.useState<Record<string, TimeSeriesMetric[]>>({});
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedPod, setExpandedPod] = React.useState<string | null>(null);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // Extract pod names from ArgoCD resource tree if available
  const treePods = React.useMemo(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.kind === 'Pod')
      .map((n: any) => n.name);
  }, [tree]);

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

  // Fetch per-pod time series when a pod is expanded
  React.useEffect(() => {
    if (!expandedPod || podCharts[expandedPod]) return;

    fetchTimeSeriesMetrics(namespace, expandedPod, 'Pod', timeRange, appNamespace, appName, project)
      .then((charts) => {
        setPodCharts((prev) => ({ ...prev, [expandedPod]: charts }));
      })
      .catch(() => {});
  }, [expandedPod, timeRange, namespace, appNamespace, appName, project]);

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
      {/* Query builder */}
      <QueryBuilder
        namespace={namespace}
        appNamespace={appNamespace}
        appName={appName}
        project={project}
      />

      {/* Aggregate metrics */}
      <div style={headerRow}>
        <SectionHeader title="NAMESPACE OVERVIEW" />
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      <div style={cardGrid}>
        {summary.map((m) => (
          <MetricCard key={m.name} label={m.name} value={m.value} unit={m.unit} />
        ))}
      </div>

      {timeSeries.length > 0 && (
        <div style={chartGrid}>
          {timeSeries.map((ts) => (
            <SparklineChart
              key={ts.name}
              title={ts.name}
              unit={ts.unit}
              data={ts.series}
              color={ts.name.includes('CPU') ? colors.orange500 : colors.blueSolid}
              height={160}
              timeRange={timeRange}
            />
          ))}
        </div>
      )}

      {/* Per-pod breakdown with expandable charts */}
      {pods.length > 0 && (
        <div style={{ marginTop: spacing[6] }}>
          <SectionHeader title="PODS" />
          <div style={podList}>
            {pods.map((p) => {
              const isExpanded = expandedPod === p.pod;
              const charts = podCharts[p.pod];
              return (
                <div key={p.pod} style={podCard}>
                  <div
                    style={podHeader}
                    onClick={() => setExpandedPod(isExpanded ? null : p.pod)}
                  >
                    <div style={podNameRow}>
                      <span style={podExpand}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                      <span style={podName}>{p.pod}</span>
                    </div>
                    <div style={podMetrics}>
                      <span style={podMetricItem}>
                        <span style={podMetricLabel}>CPU</span>
                        <span style={podMetricValue}>{p.cpu}m</span>
                      </span>
                      <span style={podMetricDivider} />
                      <span style={podMetricItem}>
                        <span style={podMetricLabel}>MEM</span>
                        <span style={podMetricValue}>{p.memory} MiB</span>
                      </span>
                      <span style={podMetricDivider} />
                      <span style={podMetricItem}>
                        <span style={podMetricLabel}>RX</span>
                        <span style={podMetricValue}>{p.netRx}</span>
                      </span>
                      <span style={podMetricDivider} />
                      <span style={podMetricItem}>
                        <span style={podMetricLabel}>TX</span>
                        <span style={podMetricValue}>{p.netTx}</span>
                      </span>
                      <span style={podMetricDivider} />
                      <span style={podMetricItem}>
                        <span style={podMetricLabel}>Restarts</span>
                        <span style={{
                          ...podMetricValue,
                          color: Number(p.restarts) > 0 ? colors.redText : colors.gray800,
                        }}>
                          {p.restarts}
                        </span>
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={podChartArea}>
                      {!charts && <Loading />}
                      {charts && charts.length > 0 && (
                        <div style={podChartGrid}>
                          {charts.map((ts) => (
                            <SparklineChart
                              key={ts.name}
                              title={ts.name}
                              unit={ts.unit}
                              data={ts.series}
                              color={ts.name.includes('CPU') ? colors.orange500 : ts.name.includes('Memory') ? colors.blueSolid : colors.greenSolid}
                              height={120}
                              timeRange={timeRange}
                            />
                          ))}
                        </div>
                      )}
                      {charts && charts.length === 0 && (
                        <div style={{ fontSize: fontSize.sm, color: colors.gray400, padding: spacing[2] }}>
                          No time series data for this pod
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Styles ---

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
  marginTop: spacing[4],
};

const podList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[2],
};

const podCard: React.CSSProperties = {
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  overflow: 'hidden',
};

const podHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${spacing[2]}px ${spacing[3]}px`,
  cursor: 'pointer',
  background: colors.gray50,
};

const podNameRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
};

const podExpand: React.CSSProperties = {
  fontSize: 10,
  color: colors.gray400,
};

const podName: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  color: colors.orange600,
};

const podMetrics: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
};

const podMetricItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
};

const podMetricLabel: React.CSSProperties = {
  fontSize: fontSize.xs,
  color: colors.gray400,
  fontWeight: fontWeight.semibold,
};

const podMetricValue: React.CSSProperties = {
  color: colors.gray800,
  fontWeight: fontWeight.medium,
};

const podMetricDivider: React.CSSProperties = {
  width: 1,
  height: 12,
  background: colors.gray200,
};

const podChartArea: React.CSSProperties = {
  padding: spacing[3],
  borderTop: `1px solid ${colors.gray200}`,
};

const podChartGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: spacing[2],
};
