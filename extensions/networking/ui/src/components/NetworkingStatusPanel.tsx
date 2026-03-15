import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, radius } from '@argoplane/shared';
import { fetchFlows } from '../api';
import { FlowsResponse } from '../types';

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function navigateToNetworking(appNamespace: string, appName: string) {
  window.location.href = `/applications/${appNamespace}/${appName}?resource=&extension=networking&view=Networking`;
}

const REFRESH_INTERVAL = 30_000;

export const NetworkingStatusPanel: React.FC<StatusPanelProps> = ({ application }) => {
  const [summary, setSummary] = React.useState<FlowsResponse['summary'] | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const fetchData = React.useCallback(() => {
    if (!namespace) return;
    fetchFlows(namespace, appNamespace, appName, project, '5m', 1, 'all', 'all')
      .then((data) => setSummary(data.summary || null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [namespace, appNamespace, appName, project]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  React.useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!loaded || !summary) return null;

  return (
    <div
      onClick={() => navigateToNetworking(appNamespace, appName)}
      style={container}
      title="Network flows in the last 5 minutes. Click to open Networking view."
    >
      <span style={label}>FLOWS (5m)</span>
      <span style={row}>
        <span style={pill}>
          <span style={pillLabel}>{formatCount(summary.total)}</span>
        </span>
        <span style={pill}>
          <span style={{ ...dot, background: colors.greenSolid }} />
          <span style={pillValue}>{formatCount(summary.forwarded)}</span>
        </span>
        {summary.dropped > 0 && (
          <span style={{ ...pill, borderColor: colors.red }}>
            <span style={{ ...dot, background: colors.redSolid }} />
            <span style={{ ...pillValue, color: colors.redText }}>{formatCount(summary.dropped)}</span>
          </span>
        )}
        {summary.error > 0 && (
          <span style={{ ...pill, borderColor: colors.yellow }}>
            <span style={{ ...dot, background: colors.yellowSolid }} />
            <span style={{ ...pillValue, color: colors.yellowText }}>{formatCount(summary.error)}</span>
          </span>
        )}
      </span>
    </div>
  );
};

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
  gap: 5,
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: '2px 8px',
};

const pillLabel: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  fontFamily: fonts.mono,
  color: colors.gray700,
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};

const pillValue: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  color: colors.gray700,
};
