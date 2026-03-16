import * as React from 'react';
import { fonts } from '@argoplane/shared';
import { fetchLogs, fetchLabelValues, fetchVolume } from '../api';
import { LogEntry, Severity, TimeRange, VolumePoint } from '../types';
import { LogLine } from './LogLine';
import { LogToolbar } from './LogToolbar';
import { VolumeChart } from './VolumeChart';

interface AppViewProps {
  application: any;
  tree?: any;
}

const REFRESH_INTERVAL = 30_000;
const DEFAULT_LIMIT = 500;

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export const AppLogsView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [volume, setVolume] = React.useState<VolumePoint[]>([]);
  const [containers, setContainers] = React.useState<string[]>([]);
  const [pods, setPods] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [totalEntries, setTotalEntries] = React.useState(0);

  const [selectedContainer, setSelectedContainer] = React.useState('');
  const [selectedPod, setSelectedPod] = React.useState('');
  const [activeSeverities, setActiveSeverities] = React.useState<Set<Severity>>(
    new Set(['debug', 'info', 'warn', 'error'])
  );
  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // Debounce search text: only update debouncedSearch after 500ms of no typing
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;

    const end = new Date();
    const start = new Date(end.getTime() - TIME_RANGE_MS[timeRange]);

    const severityFilter = activeSeverities.size < 4
      ? Array.from(activeSeverities).join(',')
      : undefined;

    const queryParams = {
      namespace,
      pod: selectedPod || undefined,
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
  }, [namespace, selectedPod, selectedContainer, debouncedSearch, activeSeverities, timeRange, appNamespace, appName, project]);

  // Fetch containers and pods for dropdowns
  React.useEffect(() => {
    if (!namespace) return;
    fetchLabelValues('container', namespace, appNamespace, appName, project)
      .then(setContainers)
      .catch(() => setContainers([]));
    fetchLabelValues('pod', namespace, appNamespace, appName, project)
      .then(setPods)
      .catch(() => setPods([]));
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

  // Calculate stats
  const errorCount = entries.filter((e) => e.severity === 'error').length;
  const warnCount = entries.filter((e) => e.severity === 'warn').length;

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
      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '8px 12px',
        backgroundColor: '#111118',
        borderBottom: '1px solid #1e1e1e',
      }}>
        <div style={{ fontFamily: fonts.mono, fontSize: '11px' }}>
          <span style={{ color: '#8e8e8e' }}>Total </span>
          <span style={{ color: '#e0e0e0' }}>{totalEntries}</span>
        </div>
        <div style={{ fontFamily: fonts.mono, fontSize: '11px' }}>
          <span style={{ color: '#8e8e8e' }}>Errors </span>
          <span style={{ color: errorCount > 0 ? '#ff5286' : '#555' }}>{errorCount}</span>
        </div>
        <div style={{ fontFamily: fonts.mono, fontSize: '11px' }}>
          <span style={{ color: '#8e8e8e' }}>Warnings </span>
          <span style={{ color: warnCount > 0 ? '#ff9830' : '#555' }}>{warnCount}</span>
        </div>
      </div>

      {/* Pod selector */}
      {pods.length > 1 && (
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid #1e1e1e',
          backgroundColor: '#111118',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontFamily: fonts.mono, fontSize: '11px', color: '#8e8e8e' }}>Pod:</span>
          <select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            style={{
              fontFamily: fonts.mono,
              fontSize: '11px',
              padding: '4px 8px',
              border: '1px solid #2a2a3a',
              borderRadius: 4,
              backgroundColor: '#1a1a2e',
              color: '#e0e0e0',
              outline: 'none',
            }}
          >
            <option value="">All pods</option>
            {pods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

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
            <LogLine key={`${entry.timestamp}-${i}`} entry={entry} showPod={true} />
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
