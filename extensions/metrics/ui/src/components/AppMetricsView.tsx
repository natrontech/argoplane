import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  Button,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  radius,
  panel,
} from '@argoplane/shared';
import { fetchAppMetrics, fetchPodBreakdown, fetchPerPodSeries } from '../api';
import { MetricData, TimeSeriesMetric, TimeRange, PodMetric, PerPodSeries } from '../types';
import { MultiSeriesChart } from './MultiSeriesChart';
import { TimeRangeSelector } from './TimeRangeSelector';
import { QueryBuilder } from './QueryBuilder';

interface AppViewProps {
  application: any;
  tree?: any;
}

const SERIES_COLORS = [
  colors.orange500, colors.blueSolid, colors.greenSolid, colors.yellowSolid,
  colors.red, colors.gray500, colors.orange300, colors.blue,
];

const REFRESH_INTERVAL = 30_000;

export const AppMetricsView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [summary, setSummary] = React.useState<MetricData[]>([]);
  const [pods, setPods] = React.useState<PodMetric[]>([]);
  const [perPod, setPerPod] = React.useState<PerPodSeries[]>([]);
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // Extract pod names from ArgoCD resource tree
  const treePodNames = React.useMemo(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.kind === 'Pod' && n.namespace === namespace)
      .map((n: any) => n.name) as string[];
  }, [tree, namespace]);

  // Extract deployment names from tree for pod breakdown
  const treeDeployments = React.useMemo(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.kind === 'Deployment' && n.namespace === namespace)
      .map((n: any) => n.name) as string[];
  }, [tree, namespace]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;

    const metricsP = fetchAppMetrics(namespace, timeRange, appNamespace, appName, project);

    // Use tree pods if available, otherwise fall back to app name selector
    const podNames = treePodNames.length > 0 ? treePodNames : undefined;
    const perPodP = fetchPerPodSeries(
      namespace, appName, 'Deployment', timeRange,
      appNamespace, appName, project, podNames
    ).catch(() => [] as PerPodSeries[]);

    // Pod breakdown: use all tree pods if available, otherwise fall back to first deployment
    const deployName = treeDeployments.length > 0 ? treeDeployments[0] : appName;
    const podsP = fetchPodBreakdown(namespace, deployName, 'Deployment', appNamespace, appName, project, podNames)
      .catch(() => [] as PodMetric[]);

    Promise.all([metricsP, perPodP, podsP])
      .then(([resp, podSeries, podList]) => {
        setSummary(resp.summary || []);
        setPerPod(podSeries || []);
        setPods(podList || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, timeRange, appNamespace, appName, project, treePodNames, treeDeployments]);

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
      {/* Query builder */}
      <QueryBuilder
        namespace={namespace}
        appNamespace={appNamespace}
        appName={appName}
        project={project}
      />

      {/* Overview */}
      <div style={headerRow}>
        <SectionHeader title="OVERVIEW" />
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      <div style={cardGrid}>
        {summary.map((m) => (
          <MetricCard key={m.name} label={m.name} value={m.value} unit={m.unit} />
        ))}
      </div>

      {/* Per-pod multi-line charts */}
      {perPod.length > 0 && (
        <div style={{ marginTop: spacing[5] }}>
          <SectionHeader title="USAGE BY POD" />
          <div style={chartGrid}>
            {perPod.map((pps) => (
              <MultiSeriesChart
                key={pps.metric}
                title={pps.metric}
                unit={pps.unit}
                timestamps={pps.timestamps}
                series={(pps.pods || []).map((p) => ({ label: p.pod, values: (p.values || []).map((v) => v === null ? NaN : v) }))}
                colors={SERIES_COLORS}
                height={220}
                timeRange={timeRange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pod table */}
      {pods.length > 0 && (
        <div style={{ marginTop: spacing[5] }}>
          <SectionHeader title="POD DETAILS" />
          <div style={podTableWrap}>
            <table style={podTable}>
              <thead>
                <tr>
                  <th style={th}>Pod</th>
                  <th style={th}>CPU</th>
                  <th style={th}>Memory</th>
                  <th style={th}>Net RX</th>
                  <th style={th}>Net TX</th>
                  <th style={th}>Restarts</th>
                </tr>
              </thead>
              <tbody>
                {pods.map((p, i) => (
                  <tr key={p.pod}>
                    <td style={td}>
                      <span style={{ ...podDot, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      {p.pod}
                    </td>
                    <td style={td}>{p.cpu}m</td>
                    <td style={td}>{p.memory} MiB</td>
                    <td style={td}>{p.netRx} KB/s</td>
                    <td style={td}>{p.netTx} KB/s</td>
                    <td style={{
                      ...td,
                      color: Number(p.restarts) > 0 ? colors.redText : undefined,
                    }}>
                      {p.restarts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
};

const podTableWrap: React.CSSProperties = {
  overflowX: 'auto',
};

const podTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
};

const th: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.gray500,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderBottom: `2px solid ${colors.gray200}`,
  textAlign: 'left',
};

const td: React.CSSProperties = {
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderBottom: `1px solid ${colors.gray100}`,
  color: colors.gray800,
};

const podDot: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: 1,
  marginRight: spacing[2],
  verticalAlign: 'middle',
};
