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

export interface NamespaceMetric {
  namespace: string;
  cpu: number;
  memory: number;
}

export interface ClusterMetricsResponse {
  summary: MetricData[];
  timeSeries?: TimeSeriesMetric[];
  namespaces: NamespaceMetric[];
}

export interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}
