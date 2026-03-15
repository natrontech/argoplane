import * as React from 'react';
import {
  SectionHeader,
  Button,
  DataTable,
  Cell,
  StatusBadge,
  Loading,
  EmptyState,
  MetaRow,
  panel,
  spacing,
} from '@argoplane/shared';
import type { Status } from '@argoplane/shared';
import { fetchBackups, triggerBackup } from '../api';

interface Backup {
  name: string;
  status: string;
  startTimestamp: string;
  completionTimestamp: string;
  includedNamespaces: string[];
}

function toStatus(raw: string): Status {
  if (raw === 'Completed') return 'healthy';
  if (raw === 'Failed' || raw === 'PartiallyFailed') return 'failed';
  if (raw === 'InProgress' || raw === 'New') return 'in-progress';
  return 'unknown';
}

function timeAgo(timestamp: string): string {
  if (!timestamp) return '-';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const BackupFlyout: React.FC<{ application: any }> = ({ application }) => {
  const [backups, setBackups] = React.useState<Backup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [triggering, setTriggering] = React.useState(false);

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || '';

  const loadBackups = React.useCallback(() => {
    if (!destNamespace) return;
    setLoading(true);
    fetchBackups(destNamespace, appNamespace, appName, project)
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setLoading(false));
  }, [destNamespace, appNamespace, appName, project]);

  React.useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleTriggerBackup = async () => {
    setTriggering(true);
    try {
      await triggerBackup(destNamespace, appNamespace, appName, project);
      setTimeout(loadBackups, 2000);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div style={panel}>
      <SectionHeader
        title="BACKUPS"
        action={
          <Button onClick={handleTriggerBackup} disabled={triggering} primary>
            {triggering ? 'Creating...' : 'Create Backup'}
          </Button>
        }
      />

      <MetaRow items={[
        { label: 'Namespace', value: destNamespace },
        { label: 'Total', value: String(backups.length) },
      ]} />

      <div style={{ marginTop: spacing[4] }}>
        {loading ? (
          <Loading />
        ) : backups.length === 0 ? (
          <EmptyState message="No backups found for this namespace" />
        ) : (
          <DataTable columns={['Name', 'Status', 'Started', 'Completed']}>
            {backups.map((b, i) => (
              <tr key={b.name}>
                <Cell>{b.name}</Cell>
                <Cell mono={false}>
                  <StatusBadge status={toStatus(b.status)} label={b.status} />
                </Cell>
                <Cell>{timeAgo(b.startTimestamp)}</Cell>
                <Cell>{timeAgo(b.completionTimestamp)}</Cell>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
};
