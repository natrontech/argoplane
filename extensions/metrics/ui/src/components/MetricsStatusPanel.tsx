import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing, radius } from '@argoplane/shared';
import { fetchAppMetrics } from '../api';
import { MetricData } from '../types';

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

function formatCompact(value: string, unit: string): string {
  const num = parseFloat(value) || 0;
  if (unit === 'MiB') {
    if (num >= 1024) return `${(num / 1024).toFixed(1)} GiB`;
    return `${Math.round(num)} MiB`;
  }
  if (unit === 'm') {
    if (num >= 1000) return `${(num / 1000).toFixed(1)} cores`;
    return `${Math.round(num)}m`;
  }
  return `${value}${unit ? ' ' + unit : ''}`;
}

function navigateToMetrics(appNamespace: string, appName: string) {
  window.location.href = `/applications/${appNamespace}/${appName}?resource=&extension=metrics&view=Metrics`;
}

const REFRESH_INTERVAL = 30_000;

export const MetricsStatusPanel: React.FC<StatusPanelProps> = ({ application }) => {
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

  React.useEffect(() => { fetchData(); }, [fetchData]);

  React.useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!loaded) return null;

  const cpu = metrics.find((m) => m.name.toLowerCase().includes('cpu'));
  const mem = metrics.find((m) => m.name.toLowerCase().includes('mem'));
  const pods = metrics.find((m) => m.name.toLowerCase().includes('pod'));

  if (!cpu && !mem) return null;

  return (
    <div
      onClick={() => navigateToMetrics(appNamespace, appName)}
      style={container}
      title="Total resource usage across all pods. Click to open Metrics view."
    >
      <span style={label}>METRICS</span>
      <span style={row}>
        {cpu && <Pill icon="CPU" value={formatCompact(cpu.value, cpu.unit)} />}
        {mem && <Pill icon="MEM" value={formatCompact(mem.value, mem.unit)} />}
        {pods && <Pill icon="PODS" value={pods.value} />}
      </span>
    </div>
  );
};

const Pill: React.FC<{ icon: string; value: string }> = ({ icon, value }) => (
  <span style={pill}>
    <span style={pillLabel}>{icon}</span>
    <span style={pillValue}>{value}</span>
  </span>
);

const container: React.CSSProperties = {
  cursor: 'pointer',
  display: 'inline-flex',
  flexDirection: 'column',
  gap: 2,
};

const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: fontWeight.semibold,
  letterSpacing: '0.5px',
  color: colors.gray400,
  fontFamily: fonts.mono,
};

const row: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0,
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  overflow: 'hidden',
};

const pillLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: fontWeight.semibold,
  fontFamily: fonts.mono,
  color: colors.orange600,
  background: colors.orange50,
  padding: '2px 5px',
  letterSpacing: '0.3px',
};

const pillValue: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  color: colors.gray700,
  padding: '2px 6px',
};
