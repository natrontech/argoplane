export interface InvolvedObject {
  kind: string;
  name: string;
  namespace: string;
}

export interface Source {
  component: string;
  host: string;
}

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  involvedObject: InvolvedObject;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  source: Source;
}

export interface Summary {
  total: number;
  warnings: number;
  normal: number;
}

export interface EventResponse {
  events: KubeEvent[];
  summary: Summary;
}

export interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}

export type SinceRange = '1h' | '6h' | '24h' | '7d';

export const SINCE_LABELS: Record<SinceRange, string> = {
  '1h': 'Last 1 hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
};
