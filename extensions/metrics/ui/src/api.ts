import { MetricData, TimeSeriesMetric, ClusterMetricsResponse, TimeRange } from './types';

export async function fetchMetrics(
  namespace: string,
  resourceName: string,
  kind: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<MetricData[]> {
  const params = new URLSearchParams({
    namespace,
    name: resourceName,
    kind,
  });

  const response = await fetch(`/extensions/metrics/api/v1/resource-metrics?${params}`, {
    headers: {
      'Argocd-Application-Name': `${appNamespace}:${appName}`,
      'Argocd-Project-Name': project,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

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
  const params = new URLSearchParams({
    namespace,
    name: resourceName,
    kind,
    range,
  });

  const response = await fetch(`/extensions/metrics/api/v1/resource-metrics?${params}`, {
    headers: {
      'Argocd-Application-Name': `${appNamespace}:${appName}`,
      'Argocd-Project-Name': project,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchClusterMetrics(
  range?: TimeRange
): Promise<ClusterMetricsResponse> {
  const params = new URLSearchParams();
  if (range) {
    params.set('range', range);
  }

  const response = await fetch(`/extensions/metrics/api/v1/cluster-metrics?${params}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
