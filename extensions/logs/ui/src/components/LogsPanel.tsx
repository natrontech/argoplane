import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  colors,
  fonts,
  fontSize,
  panel,
  spacing,
} from '@argoplane/shared';
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
  const [timeRange, setTimeRange] = React.useState<TimeRange>('1h');

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || 'Pod';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const isPod = kind === 'Pod';
  const showPod = !isPod;

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
      filter: searchText || undefined,
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
  }, [namespace, name, kind, isPod, selectedContainer, searchText, activeSeverities, timeRange, appNamespace, appName, project]);

  // Fetch containers for the dropdown
  React.useEffect(() => {
    if (!namespace) return;
    fetchLabelValues('container', namespace, appNamespace, appName, project)
      .then(setContainers)
      .catch(() => setContainers([]));
  }, [namespace, appNamespace, appName, project]);

  React.useEffect(() => {
    setLoading(true);
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

  if (loading) return <Loading />;

  if (error) {
    return (
      <div style={panel}>
        <div style={{
          padding: spacing[4],
          color: colors.red,
          fontFamily: fonts.mono,
          fontSize: fontSize.sm,
          textAlign: 'center',
        }}>
          <div>Failed to load logs: {error}</div>
          <button
            onClick={() => { setLoading(true); fetchAll(); }}
            style={{
              marginTop: spacing[2],
              padding: '4px 12px',
              border: `1px solid ${colors.gray200}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: fonts.mono,
              fontSize: fontSize.xs,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={panel}>
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
          <EmptyState message="No logs found for the selected filters" />
        ) : (
          entries.map((entry, i) => (
            <LogLine key={`${entry.timestamp}-${i}`} entry={entry} showPod={showPod} />
          ))
        )}
      </div>

      {entries.length > 0 && (
        <div style={{
          padding: `${spacing[2]}px ${spacing[3]}px`,
          borderTop: `1px solid ${colors.gray200}`,
          fontFamily: fonts.mono,
          fontSize: fontSize.xs,
          color: colors.gray500,
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>Showing {entries.length}{totalEntries > entries.length ? ` of ${totalEntries}+` : ''} entries</span>
        </div>
      )}
    </div>
  );
};
