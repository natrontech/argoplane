import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, radius } from '@argoplane/shared';
import { fetchAppMetrics } from '../api';
import { MetricData } from '../types';

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

function fmt(value: string, unit: string): string {
  const n = parseFloat(value) || 0;
  if (unit === 'MiB') return n >= 1024 ? `${(n / 1024).toFixed(1)}G` : `${Math.round(n)}Mi`;
  if (unit === 'm') return n >= 1000 ? `${(n / 1000).toFixed(1)}` : `${Math.round(n)}m`;
  return value;
}

export const MetricsStatusPanel: React.FC<StatusPanelProps> = ({ application }) => {
  const [metrics, setMetrics] = React.useState<MetricData[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  const ns = application?.spec?.destination?.namespace || '';
  const app = application?.metadata?.name || '';
  const appNs = application?.metadata?.namespace || 'argocd';
  const proj = application?.spec?.project || 'default';

  React.useEffect(() => {
    if (!ns) return;
    fetchAppMetrics(ns, undefined, appNs, app, proj)
      .then((d) => setMetrics(d.summary || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [ns, appNs, app, proj]);

  if (!loaded) return null;

  const cpu = metrics.find((m) => m.name.toLowerCase().includes('cpu'));
  const mem = metrics.find((m) => m.name.toLowerCase().includes('mem'));
  if (!cpu && !mem) return null;

  return (
    <span style={box} title="Total CPU/Memory across all pods">
      <span style={title}>Metrics</span>
      {cpu && <Item label="cpu" value={fmt(cpu.value, cpu.unit)} />}
      {mem && <Item label="mem" value={fmt(mem.value, mem.unit)} />}
    </span>
  );
};

const Item: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span style={item}>
    <span style={lbl}>{label}</span>
    <span style={val}>{value}</span>
  </span>
);

const box: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: '4px 10px',
  fontFamily: fonts.mono,
};

const title: React.CSSProperties = {
  fontSize: 10,
  fontWeight: fontWeight.semibold,
  color: colors.orange500,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginRight: 2,
};

const item: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
};

const lbl: React.CSSProperties = {
  fontSize: 10,
  color: colors.gray400,
  fontWeight: fontWeight.medium,
  textTransform: 'uppercase',
};

const val: React.CSSProperties = {
  fontSize: 12,
  fontWeight: fontWeight.semibold,
  color: colors.gray700,
};
