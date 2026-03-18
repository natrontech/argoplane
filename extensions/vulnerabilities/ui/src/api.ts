import { ImageReport, OverviewResponse, AuditOverviewResponse, SecretOverviewResponse, SbomOverviewResponse } from './types';

function proxyHeaders(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

export async function fetchOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<OverviewResponse> {
  const response = await fetch('/extensions/vulnerabilities/api/v1/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ namespace }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchAuditOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<AuditOverviewResponse> {
  const response = await fetch('/extensions/vulnerabilities/api/v1/audit/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ namespace }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSecretsOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<SecretOverviewResponse> {
  const response = await fetch('/extensions/vulnerabilities/api/v1/secrets/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ namespace }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSbomOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<SbomOverviewResponse> {
  const response = await fetch('/extensions/vulnerabilities/api/v1/sbom/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ namespace }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchReports(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  resource?: string,
  kind?: string
): Promise<ImageReport[]> {
  const params = new URLSearchParams({ namespace });
  if (resource) params.set('resource', resource);
  if (kind) params.set('kind', kind);

  const response = await fetch(`/extensions/vulnerabilities/api/v1/reports?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function triggerRescan(
  namespace: string,
  reportName: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<void> {
  const params = new URLSearchParams({ namespace, report: reportName });
  const response = await fetch(`/extensions/vulnerabilities/api/v1/rescan?${params}`, {
    method: 'POST',
    headers: proxyHeaders(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export async function triggerRescanAll(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<void> {
  const params = new URLSearchParams({ namespace });
  const response = await fetch(`/extensions/vulnerabilities/api/v1/rescan/all?${params}`, {
    method: 'POST',
    headers: proxyHeaders(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export async function downloadExport(
  namespace: string,
  type: 'vulnerabilities' | 'audit' | 'secrets' | 'sbom',
  appNamespace: string,
  appName: string,
  project: string
): Promise<void> {
  const params = new URLSearchParams({ namespace, type });
  const response = await fetch(`/extensions/vulnerabilities/api/v1/export?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const blob = await response.blob();
  const filename = type === 'audit' ? `config-audit-${namespace}.csv` : `vulnerabilities-${namespace}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
