import * as React from 'react';
import { colors, fonts, fontWeight, radius } from '@argoplane/shared';
import { fetchFlows } from '../api';
import { FlowsResponse } from '../types';

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const NetworkingStatusPanel: React.FC<StatusPanelProps> = ({ application }) => {
  const [summary, setSummary] = React.useState<FlowsResponse['summary'] | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const ns = application?.spec?.destination?.namespace || '';
  const app = application?.metadata?.name || '';
  const appNs = application?.metadata?.namespace || 'argocd';
  const proj = application?.spec?.project || 'default';

  React.useEffect(() => {
    if (!ns) return;
    fetchFlows(ns, appNs, app, proj, '5m', 1, 'all', 'all')
      .then((d) => setSummary(d.summary || null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [ns, appNs, app, proj]);

  if (!loaded || !summary) return null;

  return (
    <span style={box} title="Network flows in last 5 minutes">
      <span style={title}>Flows</span>
      <span style={val}>{fmt(summary.total)}</span>
      <span style={{ ...dot, background: colors.greenSolid }} />
      <span style={val}>{fmt(summary.forwarded)}</span>
      {summary.dropped > 0 && (
        <>
          <span style={{ ...dot, background: colors.redSolid }} />
          <span style={{ ...val, color: colors.redText }}>{fmt(summary.dropped)}</span>
        </>
      )}
    </span>
  );
};

const box: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
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

const val: React.CSSProperties = {
  fontSize: 12,
  fontWeight: fontWeight.semibold,
  color: colors.gray700,
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};
