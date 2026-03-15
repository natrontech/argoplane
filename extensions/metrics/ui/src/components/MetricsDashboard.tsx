import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  DataTable,
  Cell,
  colors,
  fonts,
  fontSize,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchClusterMetrics } from '../api';
import { ClusterMetricsResponse, TimeRange, NamespaceMetric } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';
import { formatCPU, formatMemory } from '../utils/format';

const REFRESH_INTERVAL = 30_000;

export const MetricsDashboard: React.FC = () => {
  const [data, setData] = React.useState<ClusterMetricsResponse | null>(null);
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAll = React.useCallback(() => {
    fetchClusterMetrics(timeRange)
      .then((resp) => {
        setData(resp);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [timeRange]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) {
    return (
      <div style={dashboardContainer}>
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div style={dashboardContainer}>
        <div style={{ color: colors.red, marginBottom: spacing[2] }}>
          Failed to load cluster metrics: {error}
        </div>
        <button
          onClick={() => { setLoading(true); fetchAll(); }}
          style={retryButton}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={dashboardContainer}>
        <EmptyState message="No cluster metrics available. Is Prometheus configured?" />
      </div>
    );
  }

  // Sort namespaces by CPU descending
  const sortedNamespaces = [...(data.namespaces || [])].sort((a, b) => b.cpu - a.cpu);

  return (
    <div style={dashboardContainer}>
      <div style={headerRow}>
        <h2 style={pageTitle}>Cluster Metrics</h2>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Summary cards */}
      <SectionHeader title="OVERVIEW" />
      <div style={summaryGrid}>
        {(data.summary || []).map((m) => (
          <MetricCard
            key={m.name}
            label={m.name}
            value={m.value}
            unit={m.unit}
          />
        ))}
      </div>

      {/* Time series charts */}
      {data.timeSeries && data.timeSeries.length > 0 && (
        <>
          <div style={{ marginTop: spacing[6] }}>
            <SectionHeader title="USAGE OVER TIME" />
          </div>
          <div style={chartGrid}>
            {data.timeSeries.map((ts) => (
              <SparklineChart
                key={ts.name}
                title={ts.name}
                unit={ts.unit}
                data={ts.series}
                color={ts.name.includes('CPU') ? colors.orange500 : colors.blueSolid}
                height={200}
                timeRange={timeRange}
              />
            ))}
          </div>
        </>
      )}

      {/* Top namespaces table */}
      {sortedNamespaces.length > 0 && (
        <>
          <div style={{ marginTop: spacing[6] }}>
            <SectionHeader title="TOP NAMESPACES" />
          </div>
          <DataTable columns={['Namespace', 'CPU', 'Memory']}>
            {sortedNamespaces.slice(0, 10).map((ns, i) => (
              <tr key={ns.namespace}>
                <Cell isLast={i === Math.min(sortedNamespaces.length, 10) - 1}>
                  {ns.namespace}
                </Cell>
                <Cell isLast={i === Math.min(sortedNamespaces.length, 10) - 1}>
                  {formatCPU(ns.cpu)}
                </Cell>
                <Cell isLast={i === Math.min(sortedNamespaces.length, 10) - 1}>
                  {formatMemory(ns.memory)}
                </Cell>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </div>
  );
};

const dashboardContainer: React.CSSProperties = {
  ...panel,
  maxWidth: 960,
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[5],
};

const pageTitle: React.CSSProperties = {
  fontSize: fontSize.lg,
  fontWeight: 600,
  color: colors.gray800,
  margin: 0,
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: spacing[3],
};

const chartGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
  gap: spacing[3],
};

const retryButton: React.CSSProperties = {
  background: 'none',
  border: `1px solid ${colors.gray300}`,
  borderRadius: 4,
  padding: '4px 12px',
  cursor: 'pointer',
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
  color: colors.gray600,
};
