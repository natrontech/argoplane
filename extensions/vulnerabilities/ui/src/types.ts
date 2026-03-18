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
  podName: string;
  podNamespace: string;
  reportName: string;
  vulnerabilities?: Vulnerability[];
}

export interface OverviewResponse {
  summary: VulnerabilitySummary;
  fixable: number;
  images: ImageReport[];
  namespace: string;
}
