import {
  OverviewResponse,
  BackupSummary,
  RestoreSummary,
  ResourceRef,
} from './types';

function proxyHeaders(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

export async function fetchOverview(
  namespace: string,
  resources: ResourceRef[],
  appNamespace: string,
  appName: string,
  project: string
): Promise<OverviewResponse> {
  const response = await fetch('/extensions/backups/api/v1/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ namespace, resources }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchBackups(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  schedule?: string,
  limit?: number
): Promise<BackupSummary[]> {
  const params = new URLSearchParams({ namespace });
  if (schedule) params.set('schedule', schedule);
  if (limit) params.set('limit', String(limit));
  const response = await fetch(`/extensions/backups/api/v1/backups?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchRestores(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  backup?: string
): Promise<RestoreSummary[]> {
  const params = new URLSearchParams({ namespace });
  if (backup) params.set('backup', backup);
  const response = await fetch(`/extensions/backups/api/v1/restores?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function createBackup(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  ttl?: string
): Promise<{ name: string }> {
  const body: Record<string, string> = { namespace };
  if (ttl) body.ttl = ttl;
  const response = await fetch('/extensions/backups/api/v1/backups', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function createRestore(
  backupName: string,
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<{ name: string }> {
  const response = await fetch('/extensions/backups/api/v1/restores', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ backupName, namespace }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
