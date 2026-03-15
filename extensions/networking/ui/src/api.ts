import {
  PolicySummary,
  EndpointSummary,
  FlowsResponse,
  ResourceRef,
} from './types';

function headers(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

export async function fetchPoliciesWithOwnership(
  namespace: string,
  resources: ResourceRef[],
  appNamespace: string,
  appName: string,
  project: string
): Promise<PolicySummary[]> {
  const response = await fetch('/extensions/networking/api/v1/policies-with-ownership', {
    method: 'POST',
    headers: {
      ...headers(appNamespace, appName, project),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ namespace, resources }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchEndpoints(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<EndpointSummary[]> {
  const params = new URLSearchParams({ namespace });
  const response = await fetch(`/extensions/networking/api/v1/endpoints?${params}`, {
    headers: headers(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchFlows(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string,
  since: string = '5m',
  limit: number = 200,
  verdict: string = 'all',
  direction: string = 'all'
): Promise<FlowsResponse> {
  const params = new URLSearchParams({
    namespace,
    since,
    limit: String(limit),
    verdict,
    direction,
  });
  const response = await fetch(`/extensions/networking/api/v1/flows?${params}`, {
    headers: headers(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
