import * as React from 'react';
import { fonts } from '@argoplane/shared';
import { fetchLogs, fetchLabelValues, fetchVolume } from '../api';
import { ExtensionProps, LogEntry, Severity, TimeRange, VolumePoint } from '../types';
import { LogLine } from './LogLine';
import { LogToolbar } from './LogToolbar';
import { VolumeChart } from './VolumeChart';

const REFRESH_INTERVAL = 30_000;
const DEFAULT_LIMIT = 500;

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export const LogsPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [volume, setVolume] = React.useState<VolumePoint[]>([]);
  const [containers, setContainers] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [totalEntries, setTotalEntries] = React.useState(0);

  const [selectedContainer, setSelectedContainer] = React.useState('');
  const [activeSeverities, setActiveSeverities] = React.useState<Set<Severity>>(
    new Set(['debug', 'info', 'warn', 'error'])
  );
  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || 'Pod';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const isPod = kind === 'Pod';
  const showPod = !isPod;

  // Debounce search text: only update debouncedSearch after 500ms of no typing
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  const fetchAll = React.useCallback(() => {
    if (!namespace || !name) return;

    const end = new Date();
    const start = new Date(end.getTime() - TIME_RANGE_MS[timeRange]);

    const severityFilter = activeSeverities.size < 4
      ? Array.from(activeSeverities).join(',')
      : undefined;

    const queryParams = {
      namespace,
      ...(isPod ? { pod: name } : { resource: name, kind }),
      container: selectedContainer || undefined,
      filter: debouncedSearch || undefined,
      severity: severityFilter,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: DEFAULT_LIMIT,
    };

    const logsP = fetchLogs(queryParams, appNamespace, appName, project);
    const volumeP = fetchVolume(queryParams, appNamespace, appName, project).catch(() => ({ series: [] }));

    Promise.all([logsP, volumeP])
      .then(([logsResp, volumeResp]) => {
        setEntries(logsResp.entries || []);
        setTotalEntries(logsResp.stats?.totalEntries || logsResp.entries?.length || 0);
        setVolume(volumeResp.series || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, name, kind, isPod, selectedContainer, debouncedSearch, activeSeverities, timeRange, appNamespace, appName, project]);

  // Fetch containers for the dropdown
  React.useEffect(() => {
    if (!namespace) return;
    fetchLabelValues('container', namespace, appNamespace, appName, project)
      .then(setContainers)
      .catch(() => setContainers([]));
  }, [namespace, appNamespace, appName, project]);

  // Fetch data when filters change (but not on every keystroke thanks to debounce)
  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleSeverityToggle = React.useCallback((severity: Severity) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div style={{
        backgroundColor: '#0d0d14',
        borderRadius: 4,
        padding: '40px 0',
        textAlign: 'center',
        fontFamily: fonts.mono,
        fontSize: '12px',
        color: '#8e8e8e',
      }}>
        Loading logs...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: '#0d0d14',
        borderRadius: 4,
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: fonts.mono,
          fontSize: '12px',
          color: '#ff5286',
        }}>
          Failed to load logs: {error}
        </div>
        <button
          onClick={() => { setLoading(true); fetchAll(); }}
          style={{
            marginTop: 8,
            padding: '4px 12px',
            border: '1px solid #2a2a3a',
            borderRadius: 4,
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            cursor: 'pointer',
            fontFamily: fonts.mono,
            fontSize: '11px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#0d0d14',
      borderRadius: 4,
      border: '1px solid #1e1e1e',
      overflow: 'hidden',
    }}>
      <LogToolbar
        containers={containers}
        selectedContainer={selectedContainer}
        onContainerChange={setSelectedContainer}
        activeSeverities={activeSeverities}
        onSeverityToggle={handleSeverityToggle}
        searchText={searchText}
        onSearchChange={setSearchText}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        onRefresh={() => { setLoading(true); fetchAll(); }}
      />

      <VolumeChart data={volume} />

      <div style={{ maxHeight: 600, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div style={{
            padding: '40px 0',
            textAlign: 'center',
            fontFamily: fonts.mono,
            fontSize: '12px',
            color: '#555',
          }}>
            No logs found for the selected filters
          </div>
        ) : (
          entries.map((entry, i) => (
            <LogLine key={`${entry.timestamp}-${i}`} entry={entry} showPod={showPod} />
          ))
        )}
      </div>

      {entries.length > 0 && (
        <div style={{
          padding: '6px 12px',
          borderTop: '1px solid #1e1e1e',
          fontFamily: fonts.mono,
          fontSize: '11px',
          color: '#555',
          backgroundColor: '#111118',
        }}>
          Showing {entries.length}{totalEntries > entries.length ? ` of ${totalEntries}+` : ''} entries
        </div>
      )}
    </div>
  );
};
