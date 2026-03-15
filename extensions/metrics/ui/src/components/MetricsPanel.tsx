import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  MetaRow,
  Button,
  colors,
  fonts,
  fontSize,
  fontWeight,
  panel,
  spacing,
  radius,
} from '@argoplane/shared';
import { fetchMetrics, fetchPodBreakdown, fetchPerPodSeries } from '../api';
import { ExtensionProps, MetricData, PodMetric, PerPodSeries, TimeRange } from '../types';
import { MultiSeriesChart } from './MultiSeriesChart';
import { TimeRangeSelector } from './TimeRangeSelector';

const SERIES_COLORS = [
  colors.orange500, colors.blueSolid, colors.greenSolid, colors.yellowSolid,
  colors.red, colors.gray500, colors.orange300, colors.blue,
];

const REFRESH_INTERVAL = 30_000;

export const MetricsPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [metrics, setMetrics] = React.useState<MetricData[]>([]);
  const [pods, setPods] = React.useState<PodMetric[]>([]);
  const [perPod, setPerPod] = React.useState<PerPodSeries[]>([]);
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || 'Deployment';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const isWorkload = kind === 'Deployment' || kind === 'StatefulSet';

  const fetchAll = React.useCallback(() => {
    if (!namespace || !name) return;

    const promises: Promise<any>[] = [
      fetchMetrics(namespace, name, kind, appNamespace, appName, project),
    ];

    if (isWorkload) {
      promises.push(
        fetchPodBreakdown(namespace, name, kind, appNamespace, appName, project).catch(() => []),
        fetchPerPodSeries(namespace, name, kind, timeRange, appNamespace, appName, project).catch(() => []),
      );
    } else {
      // Pod: fetch per-pod series for just this pod
      promises.push(
        Promise.resolve([]),
        fetchPerPodSeries(namespace, name, 'Pod', timeRange, appNamespace, appName, project).catch(() => []),
      );
    }

    Promise.all(promises)
      .then(([instant, podList, podSeries]) => {
        setMetrics(instant);
        setPods(podList);
        setPerPod(podSeries);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, name, kind, isWorkload, timeRange, appNamespace, appName, project]);

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

  if (metrics.length === 0 && perPod.length === 0) {
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
          ...(isWorkload && pods.length > 0 ? [{ label: 'Pods', value: String(pods.length) }] : []),
        ]} />
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Summary cards (aggregate) */}
      <div style={cardGrid}>
        {metrics.map((m) => (
          <MetricCard key={m.name} label={m.name} value={m.value} unit={m.unit} />
        ))}
      </div>

      {/* Per-pod multi-line charts (Grafana-style) */}
      {perPod.length > 0 && (
        <div style={{ marginTop: spacing[5] }}>
          <SectionHeader title={isWorkload ? 'USAGE BY POD' : 'USAGE OVER TIME'} />
          <div style={chartGrid}>
            {perPod.map((pps) => (
              <MultiSeriesChart
                key={pps.metric}
                title={pps.metric}
                unit={pps.unit}
                timestamps={pps.timestamps}
                series={pps.pods.map((p) => ({ label: p.pod, values: p.values }))}
                colors={SERIES_COLORS}
                height={200}
                timeRange={timeRange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pod table (workloads only) */}
      {isWorkload && pods.length > 0 && (
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
