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
  cpuRequest: string;
  cpuLimit: string;
  memory: string;
  memoryRequest: string;
  memoryLimit: string;
  netRx: string;
  netTx: string;
  restarts: string;
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

export type ViewMode = 'pod' | 'container';

export interface DashboardRow {
  name: string;
  title: string;
  tab: string;
  groupBy?: string; // "pod", "container", or undefined (always visible)
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

export interface ThresholdData {
  name: string;
  color: string;
  value: number;
}

export interface GraphDataResponse {
  series: GraphSeries[];
  thresholds?: ThresholdData[];
}

export interface GraphSeries {
  label: string;
  values: Array<{ time: string; value: number | null }>;
}
