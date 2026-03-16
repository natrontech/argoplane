export type TimeRange = '15m' | '1h' | '6h' | '24h';

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'unknown';

export interface LogEntry {
  timestamp: string;
  line: string;
  severity: Severity;
  labels: Record<string, string>;
}

export interface QueryStats {
  totalEntries: number;
  bytesProcessed: number;
}

export interface LogsResponse {
  entries: LogEntry[];
  stats: QueryStats;
}

export interface VolumePoint {
  time: string;
  value: number;
}

export interface VolumeResponse {
  series: VolumePoint[];
}

export interface ExtensionProps {
  resource: any;
  tree: any;
  application: any;
}
