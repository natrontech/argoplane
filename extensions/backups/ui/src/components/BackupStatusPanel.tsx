import * as React from 'react';
import { StatusBadge } from '@argoplane/shared';
import type { Status } from '@argoplane/shared';
import { fetchBackupStatus } from '../api';

interface StatusPanelProps {
  application: any;
  openFlyout: () => void;
}

function toStatus(raw: string): Status {
  if (raw === 'completed') return 'healthy';
  if (raw === 'in-progress') return 'in-progress';
  if (raw === 'failed') return 'failed';
  return 'unknown';
}

export const BackupStatusPanel: React.FC<StatusPanelProps> = ({ application, openFlyout }) => {
  const [status, setStatus] = React.useState<string>('unknown');
  const [lastBackup, setLastBackup] = React.useState<string>('');

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || '';

  React.useEffect(() => {
    if (!destNamespace) return;

    fetchBackupStatus(destNamespace, appNamespace, appName, project)
      .then((data) => {
        setStatus(data.status);
        setLastBackup(data.lastBackup);
      })
      .catch(() => setStatus('error'));
  }, [destNamespace, appNamespace, appName, project]);

  const label = lastBackup ? `Last: ${lastBackup}` : 'No backups';

  return (
    <div
      onClick={openFlyout}
      style={{ cursor: 'pointer' }}
    >
      <StatusBadge status={toStatus(status)} label={label} />
    </div>
  );
};
