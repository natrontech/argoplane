interface BackupStatus {
  status: string;
  lastBackup: string;
}

interface Backup {
  name: string;
  status: string;
  startTimestamp: string;
  completionTimestamp: string;
  includedNamespaces: string[];
}

function proxyHeaders(appNamespace: string, appName: string, project: string): Record<string, string> {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

export async function fetchBackupStatus(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<BackupStatus> {
  const params = new URLSearchParams({ namespace });
  const response = await fetch(`/extensions/backups/api/v1/status?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
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
  project: string
): Promise<Backup[]> {
  const params = new URLSearchParams({ namespace });
  const response = await fetch(`/extensions/backups/api/v1/backups?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function triggerBackup(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<void> {
  const response = await fetch('/extensions/backups/api/v1/backups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...proxyHeaders(appNamespace, appName, project),
    },
    body: JSON.stringify({ namespace }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}
