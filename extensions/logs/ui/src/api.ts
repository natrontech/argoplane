import { LogsResponse } from './types';

function argoHeaders(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

async function jsonFetch<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

export function fetchLogs(
  params: {
    namespace: string;
    pod?: string;
    resource?: string;
    kind?: string;
    container?: string;
    filter?: string;
    severity?: string;
    start?: string;
    end?: string;
    limit?: number;
    direction?: string;
    pods?: string[];
  },
  appNamespace: string, appName: string, project: string,
): Promise<LogsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('namespace', params.namespace);
  if (params.pod) searchParams.set('pod', params.pod);
  if (params.resource) searchParams.set('resource', params.resource);
  if (params.kind) searchParams.set('kind', params.kind);
  if (params.container) searchParams.set('container', params.container);
  if (params.filter) searchParams.set('filter', params.filter);
  if (params.severity) searchParams.set('severity', params.severity);
  if (params.start) searchParams.set('start', params.start);
  if (params.end) searchParams.set('end', params.end);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.direction) searchParams.set('direction', params.direction);
  if (params.pods && params.pods.length > 0) searchParams.set('pods', params.pods.join(','));
  return jsonFetch(`/extensions/logs/api/v1/logs?${searchParams}`, argoHeaders(appNamespace, appName, project));
}

export function fetchLabels(
  namespace: string,
  appNamespace: string, appName: string, project: string,
  pods?: string[],
): Promise<string[]> {
  const params = new URLSearchParams({ namespace });
  if (pods && pods.length > 0) params.set('pods', pods.join(','));
  return jsonFetch(`/extensions/logs/api/v1/logs/labels?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchLabelValues(
  label: string, namespace: string,
  appNamespace: string, appName: string, project: string,
  pods?: string[],
): Promise<string[]> {
  const params = new URLSearchParams({ namespace });
  if (pods && pods.length > 0) params.set('pods', pods.join(','));
  return jsonFetch(`/extensions/logs/api/v1/logs/label/${encodeURIComponent(label)}/values?${params}`, argoHeaders(appNamespace, appName, project));
}
