import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing, radius } from '@argoplane/shared';
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

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusColors: Record<Status, string> = {
  'healthy': colors.greenSolid,
  'degraded': colors.yellowSolid,
  'failed': colors.redSolid,
  'in-progress': colors.blueSolid,
  'unknown': colors.gray300,
};

function navigateToBackups(appNamespace: string, appName: string) {
  window.location.href = `/applications/${appNamespace}/${appName}?resource=&extension=backups&view=Backups`;
}

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

export const BackupStatusPanel: React.FC<StatusPanelProps> = ({ application }) => {
  const [latestBackup, setLatestBackup] = React.useState<BackupSummary | null>(null);
  const [scheduleCount, setScheduleCount] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || '';

  React.useEffect(() => {
    if (!destNamespace) return;
    const resources: ResourceRef[] = [];
    fetchOverview(destNamespace, resources, appNamespace, appName, project)
      .then((data: OverviewResponse) => {
        if (data.recentBackups && data.recentBackups.length > 0) {
          setLatestBackup(data.recentBackups[0]);
        }
        setScheduleCount(data.schedules?.length || 0);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [destNamespace, appNamespace, appName, project]);

  if (!loaded) return null;

  const status = phaseToStatus(latestBackup?.phase);
  const squareColor = statusColors[status] || colors.gray300;
  const backupText = latestBackup ? timeAgo(latestBackup.startTimestamp) : 'None';

  return (
    <div
      onClick={() => navigateToBackups(appNamespace, appName)}
      style={container}
      title="Last backup status and schedule count. Click to open Backups view."
    >
      <span style={label}>BACKUPS</span>
      <span style={row}>
        <span style={pill}>
          <span style={{ ...square, background: squareColor }} />
          <span style={pillValue}>{backupText}</span>
        </span>
        {scheduleCount > 0 && (
          <span style={pill}>
            <span style={schedLabel}>SCHED</span>
            <span style={pillValue}>{scheduleCount}</span>
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
  gap: 6,
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: '2px 8px',
};

const square: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};

const schedLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: fontWeight.semibold,
  fontFamily: fonts.mono,
  color: colors.orange600,
  letterSpacing: '0.3px',
};

const pillValue: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  color: colors.gray700,
};
