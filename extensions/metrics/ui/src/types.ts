export type TimeRange = '1h' | '6h' | '24h' | '7d';

export interface MetricData {
  name: string;
  value: string;
  unit: string;
}

export interface DataPoint {
  time: string;
  value: number;
}

export interface TimeSeriesMetric {
  name: string;
  unit: string;
  series: DataPoint[];
}

export interface PodMetric {
  pod: string;
  cpu: string;
  memory: string;
  netRx: string;
  netTx: string;
  restarts: string;
}

export interface CustomQueryResult {
  series?: DataPoint[];
  samples?: Array<{ labels: Record<string, string>; value: number }>;
  error?: string;
}

export interface DiscoveredMetric {
  name: string;
  category: string;
  query: string;
}

export interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}
