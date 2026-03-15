import { MetricData, TimeSeriesMetric, TimeRange, PodMetric, CustomQueryResult, DiscoveredMetric } from './types';

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

async function jsonFetch<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

export function fetchMetrics(
  namespace: string, resourceName: string, kind: string,
  appNamespace: string, appName: string, project: string
): Promise<MetricData[]> {
  const params = new URLSearchParams({ namespace, name: resourceName, kind });
  return jsonFetch(`/extensions/metrics/api/v1/resource-metrics?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchTimeSeriesMetrics(
  namespace: string, resourceName: string, kind: string, range: TimeRange,
  appNamespace: string, appName: string, project: string
): Promise<TimeSeriesMetric[]> {
  const params = new URLSearchParams({ namespace, name: resourceName, kind, range });
  return jsonFetch(`/extensions/metrics/api/v1/resource-metrics?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchAppMetrics(
  namespace: string, range: TimeRange | undefined,
  appNamespace: string, appName: string, project: string
): Promise<AppMetricsResponse> {
  const params = new URLSearchParams({ namespace });
  if (range) params.set('range', range);
  return jsonFetch(`/extensions/metrics/api/v1/app-metrics?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchPodBreakdown(
  namespace: string, name: string, kind: string,
  appNamespace: string, appName: string, project: string
): Promise<PodMetric[]> {
  const params = new URLSearchParams({ namespace, name, kind });
  return jsonFetch(`/extensions/metrics/api/v1/pod-breakdown?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchCustomQuery(
  query: string, range: TimeRange | undefined,
  appNamespace: string, appName: string, project: string
): Promise<CustomQueryResult> {
  const params = new URLSearchParams({ query });
  if (range) params.set('range', range);
  return jsonFetch(`/extensions/metrics/api/v1/query?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchDiscoverMetrics(
  namespace: string, search: string,
  appNamespace: string, appName: string, project: string
): Promise<DiscoveredMetric[]> {
  const params = new URLSearchParams({ namespace });
  if (search) params.set('search', search);
  return jsonFetch(`/extensions/metrics/api/v1/discover?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchLabelNames(
  metric: string, namespace: string,
  appNamespace: string, appName: string, project: string
): Promise<string[]> {
  const params = new URLSearchParams({ metric, namespace });
  return jsonFetch(`/extensions/metrics/api/v1/labels?${params}`, argoHeaders(appNamespace, appName, project));
}

export function fetchLabelValues(
  metric: string, label: string, namespace: string,
  appNamespace: string, appName: string, project: string
): Promise<string[]> {
  const params = new URLSearchParams({ metric, label, namespace });
  return jsonFetch(`/extensions/metrics/api/v1/labels?${params}`, argoHeaders(appNamespace, appName, project));
}
