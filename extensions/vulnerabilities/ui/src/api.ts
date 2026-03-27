import { ImageReport, OverviewResponse, AuditOverviewResponse, SecretOverviewResponse, SbomOverviewResponse } from './types';

function proxyHeaders(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

// Validate that the response has the expected shape (runtime type guard).
function validateSummary(data: any): data is { critical: number; high: number; medium: number; low: number } {
  return data && typeof data.critical === 'number' && typeof data.high === 'number';
}

function validateOverview(data: any): data is OverviewResponse {
  return data && validateSummary(data.summary) && Array.isArray(data.images);
}

export async function fetchOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  signal?: AbortSignal,
  resources?: string[]
): Promise<OverviewResponse> {
  const body: any = { namespace };
  if (resources && resources.length > 0) body.resources = resources;
  const response = await fetch('/extensions/vulnerabilities/api/v1/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const data = await response.json();
  if (!validateOverview(data)) {
    throw new Error('Invalid response format from vulnerability overview');
  }
  return data;
}

export async function fetchAuditOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  signal?: AbortSignal,
  resources?: string[]
): Promise<AuditOverviewResponse> {
  const body: any = { namespace };
  if (resources && resources.length > 0) body.resources = resources;
  const response = await fetch('/extensions/vulnerabilities/api/v1/audit/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const data = await response.json();
  if (!data || !validateSummary(data.summary) || !Array.isArray(data.reports)) {
    throw new Error('Invalid response format from audit overview');
  }
  return data;
}

export async function fetchSecretsOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  signal?: AbortSignal,
  resources?: string[]
): Promise<SecretOverviewResponse> {
  const body: any = { namespace };
  if (resources && resources.length > 0) body.resources = resources;
  const response = await fetch('/extensions/vulnerabilities/api/v1/secrets/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

export async function fetchSbomOverview(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  signal?: AbortSignal,
  resources?: string[]
): Promise<SbomOverviewResponse> {
  const body: any = { namespace };
  if (resources && resources.length > 0) body.resources = resources;
  const response = await fetch('/extensions/vulnerabilities/api/v1/sbom/overview', {
    method: 'POST',
    headers: {
      ...proxyHeaders(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

export async function fetchReports(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  resource?: string,
  kind?: string,
  signal?: AbortSignal
): Promise<ImageReport[]> {
  const params = new URLSearchParams({ namespace });
  if (resource) params.set('resource', resource);
  if (kind) params.set('kind', kind);

  const response = await fetch(`/extensions/vulnerabilities/api/v1/reports?${params}`, {
    headers: proxyHeaders(appNamespace, appName, project),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Invalid response format from vulnerability reports');
  }
  return data;
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
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const blob = await response.blob();
  // Extract filename from Content-Disposition or generate a safe default.
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename=([^\s;]+)/);
  const filename = filenameMatch ? filenameMatch[1] : `${type}-${namespace}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
