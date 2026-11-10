export type Severity = 'critical' | 'warning' | 'info' | 'unknown';
export type Owner = 'app' | 'platform';

export interface Link {
  label: string;
  url: string;
}

export interface Alert {
  name: string;
  state: 'firing' | 'pending';
  severity: Severity;
  severityRaw?: string;
  summary?: string;
  description?: string;
  owner: Owner;
  namespace?: string;
  labels: Record<string, string>;
  activeAt?: string;
  value?: string;
  group: string;
  silenced: boolean;
  inhibited: boolean;
  links: Link[];
}

export interface Summary {
  firing: number;
  pending: number;
  suppressed: number;
  critical: number;
  warning: number;
  info: number;
  unknown: number;
}

export interface AlertsResponse {
  alerts: Alert[];
  summary: Summary;
  warnings?: string[];
}

export interface Rule {
  name: string;
  group: string;
  query: string;
  for?: string;
  severity: Severity;
  summary?: string;
  health: string;
  lastError?: string;
  state: string;
  firing: number;
  pending: number;
  links: Link[];
}

export interface RulesResponse {
  rules: Rule[];
}

export interface AppContext {
  appNamespace: string;
  appName: string;
  project: string;
}

/** Reads the proxy headers' inputs from an ArgoCD Application object. */
export function appContext(application: any): AppContext {
  return {
    appNamespace: application?.metadata?.namespace || 'argocd',
    appName: application?.metadata?.name || '',
    project: application?.spec?.project || 'default',
  };
}
