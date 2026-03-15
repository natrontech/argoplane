import * as React from 'react';
import { StatusBadge, colors, fonts, fontSize, spacing } from '@argoplane/shared';
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

interface StatusPanelProps {
  application: any;
  openFlyout?: () => void;
}

export const BackupStatusPanel: React.FC<StatusPanelProps> = ({ application, openFlyout }) => {
  const [latestBackup, setLatestBackup] = React.useState<BackupSummary | null>(null);
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
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [destNamespace, appNamespace, appName, project]);

  if (!loaded) return null;

  const status = phaseToStatus(latestBackup?.phase);
  const label = latestBackup
    ? `Last: ${timeAgo(latestBackup.startTimestamp)}`
    : 'No backups';

  return (
    <div
      onClick={openFlyout}
      style={{ cursor: openFlyout ? 'pointer' : 'default' }}
    >
      <StatusBadge status={status} label={label} />
    </div>
  );
};
