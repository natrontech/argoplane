import * as React from 'react';
import { Loading, colors, fonts, fontSize, spacing, radius } from '@argoplane/shared';
import { fetchGraphData } from '../api';
import { GraphDataResponse, DashboardGraph } from '../types';
import { MetricsChart } from './MetricsChart';

interface GraphPanelProps {
  graph: DashboardGraph;
  row: string;
  applicationName: string;
  groupKind: string;
  namespace: string;
  name: string;
  duration: string;
  appNamespace: string;
  appName: string;
  project: string;
  syncId?: string;
  pods?: string[]; // Filter to specific pods
}

const REFRESH_INTERVAL = 30_000;

export const GraphPanel: React.FC<GraphPanelProps> = ({
  graph, row, applicationName, groupKind,
  namespace, name, duration,
  appNamespace, appName, project,
  syncId, pods,
}) => {
  const [data, setData] = React.useState<GraphDataResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const podsKey = pods ? pods.join(',') : '';

  const fetchData = React.useCallback(() => {
    fetchGraphData(applicationName, groupKind, row, graph.name, namespace, name, duration, appNamespace, appName, project, pods)
      .then((resp) => {
        setData(resp);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationName, groupKind, row, graph.name, namespace, name, duration, appNamespace, appName, project, podsKey]);

  React.useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  React.useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div style={loadingBox}>
        <Loading />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={errorBox}>
        <span style={{ fontFamily: fonts.mono, fontSize: fontSize.xs }}>{graph.title}: {error}</span>
      </div>
    );
  }

  if (!data || !data.series || data.series.length === 0) {
    return (
      <div style={emptyBox}>
        <span style={{ fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.gray400 }}>
          {graph.title}: no data
        </span>
      </div>
    );
  }

  // Convert GraphDataResponse to MetricsChart format
  const firstValues = data.series[0]?.values || [];
  const timestamps = firstValues.map((v) => v.time);
  const series = data.series.map((s) => ({
    label: s.label || 'unknown',
    values: (s.values || []).map((v) => v.value === null ? NaN : v.value),
  }));

  // Map threshold data from response
  const thresholds = data.thresholds?.map((t) => ({
    name: t.name,
    color: t.color,
    value: t.value,
  }));

  return (
    <MetricsChart
      title={graph.title}
      unit={displayUnit(graph.yAxisUnit)}
      timestamps={timestamps}
      series={series}
      height={150}
      timeRange={duration}
      syncId={syncId || 'argoplane-metrics'}
      thresholds={thresholds}
    />
  );
};

function displayUnit(unit: string): string {
  switch (unit) {
    case 'bytes': return 'MiB';
    case 'bytes/s': return 'KB/s';
    case 'millicores': return 'millicores';
    default: return unit;
  }
}

const loadingBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 150,
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
};

const errorBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 100,
  background: colors.gray50,
  border: `1px dashed ${colors.red}`,
  borderRadius: radius.md,
  padding: spacing[2],
  color: colors.redText,
};

const emptyBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 100,
  background: colors.gray50,
  border: `1px dashed ${colors.gray200}`,
  borderRadius: radius.md,
};
