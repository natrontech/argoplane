import * as React from 'react';
import { colors, fonts, fontSize, fontWeight } from '@argoplane/shared';
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

function nav(appNs: string, app: string) {
  window.location.href = `/applications/${appNs}/${app}?resource=&extension=networking&view=Networking`;
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
    <span
      onClick={() => nav(appNs, app)}
      style={wrap}
      title="Network flows last 5m (click for details)"
    >
      <span style={val}>{fmt(summary.total)}</span>
      <span style={lbl}>flows</span>
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

const wrap: React.CSSProperties = {
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: fonts.mono,
};

const val: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  color: colors.gray700,
};

const lbl: React.CSSProperties = {
  fontSize: 11,
  color: colors.gray400,
  fontWeight: fontWeight.medium,
  marginRight: 2,
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};
