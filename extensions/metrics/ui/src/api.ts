import { MetricData, TimeSeriesMetric, TimeRange, PodMetric, CustomQueryResult } from './types';

interface AppMetricsResponse {
  summary: MetricData[];
  timeSeries?: TimeSeriesMetric[];
}

function argoHeaders(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

export async function fetchMetrics(
  namespace: string,
  resourceName: string,
  kind: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<MetricData[]> {
  const params = new URLSearchParams({ namespace, name: resourceName, kind });
  const response = await fetch(`/extensions/metrics/api/v1/resource-metrics?${params}`, {
    headers: argoHeaders(appNamespace, appName, project),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

export async function fetchTimeSeriesMetrics(
  namespace: string,
  resourceName: string,
  kind: string,
  range: TimeRange,
  appNamespace: string,
  appName: string,
  project: string
): Promise<TimeSeriesMetric[]> {
  const params = new URLSearchParams({ namespace, name: resourceName, kind, range });
  const response = await fetch(`/extensions/metrics/api/v1/resource-metrics?${params}`, {
    headers: argoHeaders(appNamespace, appName, project),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

export async function fetchAppMetrics(
  namespace: string,
  range: TimeRange | undefined,
  appNamespace: string,
  appName: string,
  project: string
): Promise<AppMetricsResponse> {
  const params = new URLSearchParams({ namespace });
  if (range) params.set('range', range);
  const response = await fetch(`/extensions/metrics/api/v1/app-metrics?${params}`, {
    headers: argoHeaders(appNamespace, appName, project),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

export async function fetchPodBreakdown(
  namespace: string,
  name: string,
  kind: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<PodMetric[]> {
  const params = new URLSearchParams({ namespace, name, kind });
  const response = await fetch(`/extensions/metrics/api/v1/pod-breakdown?${params}`, {
    headers: argoHeaders(appNamespace, appName, project),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

export async function fetchCustomQuery(
  query: string,
  range: TimeRange | undefined,
  appNamespace: string,
  appName: string,
  project: string
): Promise<CustomQueryResult> {
  const params = new URLSearchParams({ query });
  if (range) params.set('range', range);
  const response = await fetch(`/extensions/metrics/api/v1/query?${params}`, {
    headers: argoHeaders(appNamespace, appName, project),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}
