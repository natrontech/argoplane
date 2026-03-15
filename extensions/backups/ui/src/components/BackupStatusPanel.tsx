import * as React from 'react';
import { colors, fonts, fontSize, fontWeight } from '@argoplane/shared';
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

function nav(appNs: string, app: string) {
  window.location.href = `/applications/${appNs}/${app}?resource=&extension=backups&view=Backups`;
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
    <span
      onClick={() => nav(appNs, app)}
      style={wrap}
      title="Last backup status (click for details)"
    >
      <span style={{ ...dot, background: statusClr[st] }} />
      <span style={val}>{latest ? timeAgo(latest.startTimestamp) : 'none'}</span>
      {scheds > 0 && (
        <>
          <span style={sep} />
          <span style={lbl}>{scheds} sched</span>
        </>
      )}
    </span>
  );
};

const wrap: React.CSSProperties = {
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontFamily: fonts.mono,
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
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
};

const sep: React.CSSProperties = {
  width: 1,
  height: 12,
  background: colors.gray200,
};
