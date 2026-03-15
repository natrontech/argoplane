import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing, radius } from '@argoplane/shared';
import { fetchAppMetrics } from '../api';
import { MetricData } from '../types';

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

function parseValue(raw: string): number {
  return parseFloat(raw) || 0;
}

function formatCompact(value: string, unit: string): string {
  const num = parseValue(value);
  if (unit === 'MiB') {
    if (num >= 1024) return `${(num / 1024).toFixed(1)} GiB`;
    return `${Math.round(num)} MiB`;
  }
  if (unit === 'm') {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}`;
    return `${Math.round(num)}m`;
  }
  return `${value}${unit ? ' ' + unit : ''}`;
}

const REFRESH_INTERVAL = 30_000;

export const MetricsStatusPanel: React.FC<StatusPanelProps> = ({ application, openFlyout }) => {
  const [metrics, setMetrics] = React.useState<MetricData[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const fetchData = React.useCallback(() => {
    if (!namespace) return;
    fetchAppMetrics(namespace, undefined, appNamespace, appName, project)
      .then((data) => setMetrics(data.summary || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [namespace, appNamespace, appName, project]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  React.useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!loaded) return null;

  const cpu = metrics.find((m) => m.name.toLowerCase().includes('cpu'));
  const mem = metrics.find((m) => m.name.toLowerCase().includes('mem'));

  if (!cpu && !mem) return null;

  return (
    <div
      onClick={openFlyout}
      style={{
        cursor: openFlyout ? 'pointer' : 'default',
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing[3],
      }}
    >
      {cpu && (
        <span style={metricItem}>
          <span style={metricIcon}>C</span>
          <span style={metricVal}>{formatCompact(cpu.value, cpu.unit)}</span>
        </span>
      )}
      {mem && (
        <span style={metricItem}>
          <span style={metricIcon}>M</span>
          <span style={metricVal}>{formatCompact(mem.value, mem.unit)}</span>
        </span>
      )}
    </div>
  );
};

const metricItem: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const metricIcon: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  background: colors.orange100,
  color: colors.orange600,
  fontSize: 9,
  fontWeight: fontWeight.semibold,
  fontFamily: fonts.mono,
  borderRadius: radius.sm,
  lineHeight: 1,
  flexShrink: 0,
};

const metricVal: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  color: colors.gray700,
};
