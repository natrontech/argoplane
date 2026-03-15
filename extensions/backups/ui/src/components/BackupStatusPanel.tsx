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

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

export const BackupStatusPanel: React.FC<StatusPanelProps> = ({ application, openFlyout }) => {
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
      <span style={itemStyle}>
        <span style={{ ...square, background: squareColor }} />
        <span style={valStyle}>
          {latestBackup ? timeAgo(latestBackup.startTimestamp) : 'None'}
        </span>
      </span>
      {scheduleCount > 0 && (
        <span style={itemStyle}>
          <span style={scheduleIcon}>S</span>
          <span style={valStyle}>{scheduleCount}</span>
        </span>
      )}
    </div>
  );
};

const itemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const square: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};

const scheduleIcon: React.CSSProperties = {
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

const valStyle: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  color: colors.gray700,
};
