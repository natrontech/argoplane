import {
  OverviewResponse,
  BackupSummary,
  RestoreSummary,
  ResourceRef,
  RestoreOptions,
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
  project: string,
  options?: RestoreOptions
): Promise<{ name: string }> {
  const body: Record<string, unknown> = { backupName, namespace };
  if (options?.includedResources?.length) body.includedResources = options.includedResources;
  if (options?.excludedResources?.length) body.excludedResources = options.excludedResources;
  if (options?.namespaceMapping && Object.keys(options.namespaceMapping).length > 0) body.namespaceMapping = options.namespaceMapping;
  if (options?.existingResourcePolicy) body.existingResourcePolicy = options.existingResourcePolicy;
  if (options?.restorePVs !== undefined) body.restorePVs = options.restorePVs;
  const response = await fetch('/extensions/backups/api/v1/restores', {
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

export async function fetchLogs(
  name: string,
  kind: 'BackupLog' | 'RestoreLog' | 'BackupResults' | 'RestoreResults',
  appNamespace: string,
  appName: string,
  project: string
): Promise<{ downloadURL: string }> {
  const params = new URLSearchParams({ name, kind });
  const response = await fetch(`/extensions/backups/api/v1/logs?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
