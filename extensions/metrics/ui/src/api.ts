interface MetricData {
  name: string;
  value: string;
  unit: string;
}

export async function fetchMetrics(
  namespace: string,
  resourceName: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<MetricData[]> {
  const params = new URLSearchParams({
    namespace,
    name: resourceName,
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
