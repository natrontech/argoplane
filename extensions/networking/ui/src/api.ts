export interface PolicySummary {
  name: string;
  namespace?: string;
  description?: string;
  endpointSelector?: Record<string, string>;
  hasIngress: boolean;
  hasEgress: boolean;
  ingressRuleCount: number;
  egressRuleCount: number;
  labels?: Record<string, string>;
  creationTimestamp: string;
}

export interface EndpointSummary {
  name: string;
  namespace: string;
  endpointId: number;
  identityId: number;
  ipv4?: string;
  ipv6?: string;
  ingressEnforcement: string;
  egressEnforcement: string;
  state: string;
  labels?: Record<string, string>;
  namedPorts?: Array<{ name: string; port: number; protocol: string }>;
}

export interface IdentitySummary {
  id: string;
  labels: Record<string, string>;
}

function headers(appNamespace: string, appName: string, project: string) {
  return {
    'Argocd-Application-Name': `${appNamespace}:${appName}`,
    'Argocd-Project-Name': project,
  };
}

export async function fetchPolicies(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<PolicySummary[]> {
  const params = new URLSearchParams({ namespace });
  const response = await fetch(`/extensions/networking/api/v1/policies?${params}`, {
    headers: headers(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchClusterwidePolicies(
  appNamespace: string,
  appName: string,
  project: string
): Promise<PolicySummary[]> {
  const response = await fetch('/extensions/networking/api/v1/clusterwide-policies', {
    headers: headers(appNamespace, appName, project),
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

export async function fetchIdentities(
  namespace: string,
  appNamespace: string,
  appName: string,
  project: string
): Promise<IdentitySummary[]> {
  const params = new URLSearchParams({ namespace });
  const response = await fetch(`/extensions/networking/api/v1/identities?${params}`, {
    headers: headers(appNamespace, appName, project),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
