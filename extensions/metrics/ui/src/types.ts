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

export interface NamedSeries {
  label: string;
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
  multiSeries?: NamedSeries[];
  samples?: Array<{ labels: Record<string, string>; value: number }>;
  error?: string;
}

export interface DiscoveredMetric {
  name: string;
  category: string;
  query: string;
}

export interface PerPodSeries {
  metric: string;
  unit: string;
  timestamps: string[];
  pods: Array<{ pod: string; values: (number | null)[] }>;
}

export interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}

// --- Config-driven dashboard types ---

export interface DashboardConfig {
  groupKind: string;
  tabs: string[];
  intervals: string[];
  rows: DashboardRow[];
}

export interface DashboardRow {
  name: string;
  title: string;
  tab: string;
  graphs: DashboardGraph[];
}

export interface DashboardGraph {
  name: string;
  title: string;
  description: string;
  graphType: string;
  metricName: string;
  queryExpression: string;
  yAxisUnit: string;
  thresholds?: Array<{
    name: string;
    color: string;
    value: string;
    queryExpression: string;
  }>;
}

export interface GraphDataResponse {
  series: GraphSeries[];
}

export interface GraphSeries {
  label: string;
  values: Array<{ time: string; value: number | null }>;
}
