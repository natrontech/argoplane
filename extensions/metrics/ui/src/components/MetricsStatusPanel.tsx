import * as React from 'react';
import { colors, fonts, fontSize, fontWeight } from '@argoplane/shared';
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

function nav(appNs: string, app: string) {
  window.location.href = `/applications/${appNs}/${app}?resource=&extension=metrics&view=Metrics`;
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
    <span
      onClick={() => nav(appNs, app)}
      style={wrap}
      title="Total CPU/Memory across all pods (click for details)"
    >
      {cpu && <><span style={lbl}>cpu</span><span style={val}>{fmt(cpu.value, cpu.unit)}</span></>}
      {cpu && mem && <span style={sep} />}
      {mem && <><span style={lbl}>mem</span><span style={val}>{fmt(mem.value, mem.unit)}</span></>}
    </span>
  );
};

const wrap: React.CSSProperties = {
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: fonts.mono,
};

const lbl: React.CSSProperties = {
  fontSize: 11,
  color: colors.gray400,
  fontWeight: fontWeight.medium,
  textTransform: 'uppercase',
};

const val: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  color: colors.gray700,
};

const sep: React.CSSProperties = {
  width: 1,
  height: 12,
  background: colors.gray200,
  marginLeft: 2,
  marginRight: 2,
};
