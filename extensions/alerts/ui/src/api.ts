import { AlertsResponse, AppContext, RulesResponse } from './types';

async function jsonFetch<T>(url: string, ctx: AppContext, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Argocd-Application-Name': `${ctx.appNamespace}:${ctx.appName}`,
      'Argocd-Project-Name': ctx.project,
    },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json();
}

/** Alerts for the whole Application, or one of its namespaces or workloads. */
export function fetchAlerts(
  ctx: AppContext,
  filter: { namespace?: string; kind?: string; name?: string },
  signal?: AbortSignal,
): Promise<AlertsResponse> {
  const params = new URLSearchParams();
  if (filter.namespace) params.set('namespace', filter.namespace);
  if (filter.kind) params.set('kind', filter.kind);
  if (filter.name) params.set('name', filter.name);
  const qs = params.toString();
  return jsonFetch(`/extensions/alerts/api/v1/alerts${qs ? `?${qs}` : ''}`, ctx, signal);
}

/** The alerting rules the Application deploys itself. */
export function fetchRules(ctx: AppContext, signal?: AbortSignal): Promise<RulesResponse> {
  return jsonFetch('/extensions/alerts/api/v1/rules', ctx, signal);
}
