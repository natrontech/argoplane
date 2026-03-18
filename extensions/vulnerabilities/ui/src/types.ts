export interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface Vulnerability {
  id: string;
  severity: string;
  score: number;
  package: string;
  installedVersion: string;
  fixedVersion: string;
  title: string;
  primaryLink: string;
  target: string;
}

export interface ImageReport {
  image: string;
  tag: string;
  registry: string;
  summary: VulnerabilitySummary;
  fixable: number;
  lastScanned: string;
  containerName: string;
  resourceKind: string;
  resourceName: string;
  resourceNamespace: string;
  reportName: string;
  vulnerabilities?: Vulnerability[];
}

export interface OverviewResponse {
  summary: VulnerabilitySummary;
  fixable: number;
  images: ImageReport[];
  namespace: string;
}

export interface AuditCheck {
  checkID: string;
  title: string;
  severity: string;
  category: string;
  description: string;
  messages: string[];
  remediation: string;
  success: boolean;
  scope?: string;
}

export interface AuditReport {
  resourceKind: string;
  resourceName: string;
  resourceNamespace: string;
  summary: VulnerabilitySummary;
  checks: AuditCheck[];
  lastScanned: string;
  reportName: string;
}

export interface AuditOverviewResponse {
  summary: VulnerabilitySummary;
  reports: AuditReport[];
  namespace: string;
}
