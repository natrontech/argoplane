import { ImageReport, OverviewResponse } from './types';

function proxyHeaders(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

export async function fetchOverview(
  namespace: string,
  pods: string[],
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
    body: JSON.stringify({ namespace, pods }),
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
  pod?: string
): Promise<ImageReport[]> {
  const params = new URLSearchParams({ namespace });
  if (pod) params.set('pod', pod);

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
