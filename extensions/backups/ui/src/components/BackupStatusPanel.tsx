import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, radius } from '@argoplane/shared';
import type { Status } from '@argoplane/shared';
import { fetchOverview } from '../api';
import { OverviewResponse, BackupSummary, ResourceRef } from '../types';

function phaseToStatus(phase?: string): Status {
  if (!phase) return 'unknown';
  switch (phase) {
    case 'Completed': return 'healthy';
    case 'PartiallyFailed': return 'degraded';
    case 'Failed': return 'failed';
    case 'InProgress': case 'New': return 'in-progress';
    default: return 'unknown';
  }
}

const statusClr: Record<Status, string> = {
  'healthy': colors.greenSolid,
  'degraded': colors.yellowSolid,
  'failed': colors.redSolid,
  'in-progress': colors.blueSolid,
  'unknown': colors.gray300,
};

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  if (d < 0) return 'now';
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

export const BackupStatusPanel: React.FC<StatusPanelProps> = ({ application }) => {
  const [latest, setLatest] = React.useState<BackupSummary | null>(null);
  const [scheds, setScheds] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);

  const app = application?.metadata?.name || '';
  const appNs = application?.metadata?.namespace || 'argocd';
  const proj = application?.spec?.project || 'default';
  const destNs = application?.spec?.destination?.namespace || '';

  React.useEffect(() => {
    if (!destNs) return;
    fetchOverview(destNs, [] as ResourceRef[], appNs, app, proj)
      .then((data: OverviewResponse) => {
        if (data.recentBackups?.length > 0) setLatest(data.recentBackups[0]);
        setScheds(data.schedules?.length || 0);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [destNs, appNs, app, proj]);

  if (!loaded) return null;

  const st = phaseToStatus(latest?.phase);

  return (
    <span style={box} title="Last backup status">
      <span style={title}>Backups</span>
      <span style={{ ...dot, background: statusClr[st] }} />
      <span style={val}>{latest ? timeAgo(latest.startTimestamp) : 'none'}</span>
      {scheds > 0 && (
        <span style={sub}>{scheds} sched</span>
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

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};

const val: React.CSSProperties = {
  fontSize: 12,
  fontWeight: fontWeight.semibold,
  color: colors.gray700,
};

const sub: React.CSSProperties = {
  fontSize: 10,
  color: colors.gray400,
  fontWeight: fontWeight.medium,
};
