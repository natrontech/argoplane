import { EventResponse } from './types';

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

export function fetchEvents(
  params: {
    namespace: string;
    kind?: string;
    name?: string;
    type?: string;
    since?: string;
  },
  appNamespace: string, appName: string, project: string,
): Promise<EventResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('namespace', params.namespace);
  if (params.kind) searchParams.set('kind', params.kind);
  if (params.name) searchParams.set('name', params.name);
  if (params.type) searchParams.set('type', params.type);
  if (params.since) searchParams.set('since', params.since);
  return jsonFetch(`/extensions/events/api/v1/events?${searchParams}`, argoHeaders(appNamespace, appName, project));
}
