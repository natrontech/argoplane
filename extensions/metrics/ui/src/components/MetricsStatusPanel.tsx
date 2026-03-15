import * as React from 'react';
import {
  Loading,
  SectionHeader,
  MetricCard,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  radius,
  panel,
} from '@argoplane/shared';
import { fetchAppMetrics } from '../api';
import { MetricData, TimeSeriesMetric, TimeRange } from '../types';
import { SparklineChart } from './SparklineChart';
import { TimeRangeSelector } from './TimeRangeSelector';

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
    return <span style={compactContainer}>...</span>;
  }

  if (error || summary.length === 0) {
    return null; // Don't show panel if no data
  }

  const cpu = summary.find((m) => m.name === 'CPU Usage');
  const mem = summary.find((m) => m.name === 'Memory Usage');

  return (
    <div
      style={compactContainer}
      onClick={openFlyout}
      title="Click for detailed metrics"
    >
      <span style={labelStyle}>CPU</span>
      <span style={valueStyle}>{cpu?.value || '-'}</span>
      <span style={unitStyle}>{cpu?.unit || ''}</span>
      <span style={separator}>{'\u00B7'}</span>
      <span style={labelStyle}>MEM</span>
      <span style={valueStyle}>{mem?.value || '-'}</span>
      <span style={unitStyle}>{mem?.unit || ''}</span>
    </div>
  );
};

// Flyout content: full app metrics with charts
export const MetricsFlyout: React.FC<{ application: any }> = ({ application }) => {
  const [summary, setSummary] = React.useState<MetricData[]>([]);
  const [timeSeries, setTimeSeries] = React.useState<TimeSeriesMetric[]>([]);
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;

    fetchAppMetrics(namespace, timeRange, appNamespace, appName, project)
      .then((resp) => {
        setSummary(resp.summary || []);
        setTimeSeries(resp.timeSeries || []);
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
    return <Loading />;
  }

  if (error) {
    return (
      <div style={{ ...panel, color: colors.red }}>
        Failed to load metrics: {error}
      </div>
    );
  }

  return (
    <div style={panel}>
      <SectionHeader
        title={`METRICS: ${appName}`}
        action={<TimeRangeSelector value={timeRange} onChange={setTimeRange} />}
      />

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
              height={160}
              timeRange={timeRange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const compactContainer: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  cursor: 'pointer',
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
};

const labelStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  color: colors.gray500,
  letterSpacing: '0.3px',
};

const valueStyle: React.CSSProperties = {
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
};

const unitStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  color: colors.gray400,
};

const separator: React.CSSProperties = {
  color: colors.gray300,
  margin: '0 2px',
};

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: spacing[3],
  marginTop: spacing[3],
};

const chartGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: spacing[3],
  marginTop: spacing[4],
};
