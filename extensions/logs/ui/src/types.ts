export type RelativeRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '2d' | '7d';

export interface TimeSelection {
  type: 'relative' | 'absolute';
  relative?: RelativeRange;
  from?: string; // ISO string for absolute
  to?: string;   // ISO string for absolute
}

/** Kept for backward compat during migration, but prefer TimeSelection */
export type TimeRange = RelativeRange;

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

/** Resolve a TimeSelection to { start, end } Date objects */
export function resolveTimeSelection(sel: TimeSelection): { start: Date; end: Date } {
  if (sel.type === 'absolute' && sel.from && sel.to) {
    return { start: new Date(sel.from), end: new Date(sel.to) };
  }
  const end = new Date();
  const ms = RELATIVE_MS[sel.relative || '1h'];
  const start = new Date(end.getTime() - ms);
  return { start, end };
}

export const RELATIVE_MS: Record<RelativeRange, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export const RELATIVE_LABELS: Record<RelativeRange, string> = {
  '5m': 'Last 5 minutes',
  '15m': 'Last 15 minutes',
  '30m': 'Last 30 minutes',
  '1h': 'Last 1 hour',
  '3h': 'Last 3 hours',
  '6h': 'Last 6 hours',
  '12h': 'Last 12 hours',
  '24h': 'Last 24 hours',
  '2d': 'Last 2 days',
  '7d': 'Last 7 days',
};
