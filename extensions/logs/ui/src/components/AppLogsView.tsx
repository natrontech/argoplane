import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  ScopeToggle,
  extractPodNames,
  colors,
  fonts,
  fontSize,
  panel,
  spacing,
} from '@argoplane/shared';
import { useStickyScope } from '@argoplane/shared';
import { fetchLogs, fetchLabelValues } from '../api';
import { LogEntry, Severity, TimeSelection, logEntryKey, resolveTimeSelection } from '../types';
import { LogLine } from './LogLine';
import { LogToolbar } from './LogToolbar';

interface AppViewProps {
  application: any;
  tree?: any;
}

const REFRESH_INTERVAL = 30_000;
const DEFAULT_LIMIT = 500;

export const AppLogsView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [containers, setContainers] = React.useState<string[]>([]);
  const [pods, setPods] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [totalEntries, setTotalEntries] = React.useState(0);

  const [selectedContainer, setSelectedContainer] = React.useState('');
  const [selectedPod, setSelectedPod] = React.useState('');
  const [activeSeverities, setActiveSeverities] = React.useState<Set<Severity>>(
    new Set(['debug', 'info', 'warn', 'error'])
  );
  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [timeSelection, setTimeSelection] = React.useState<TimeSelection>({
    type: 'relative',
    relative: '1h',
  });
  const [scope, setScope] = useStickyScope();

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // The tree object gets a fresh identity on every app refresh, so derive a
  // stable string key from the pod names and memoize the array on that.
  const podsKey = extractPodNames(tree, namespace).join('|');
  const treePodNames = React.useMemo(() => (podsKey ? podsKey.split('|') : []), [podsKey]);
  const scopedPods = scope === 'app' && treePodNames.length > 0 ? treePodNames : undefined;

  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  // Debounce search text: only update debouncedSearch after 500ms of no typing
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  const noSeverities = activeSeverities.size === 0;

  const fetchAll = React.useCallback(() => {
    if (!namespace) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();

    if (activeSeverities.size === 0) {
      // Nothing selected: skip the fetch instead of querying without a filter.
      setEntries([]);
      setTotalEntries(0);
      setError(null);
      setLoading(false);
      return;
    }

    const { start, end } = resolveTimeSelection(timeSelection);

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
      pods: scopedPods,
    };

    const controller = new AbortController();
    abortRef.current = controller;

    fetchLogs(queryParams, appNamespace, appName, project, controller.signal)
      .then((logsResp) => {
        if (controller.signal.aborted) return;
        setEntries(logsResp.entries || []);
        setTotalEntries(logsResp.stats?.totalEntries || logsResp.entries?.length || 0);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [namespace, selectedPod, selectedContainer, debouncedSearch, activeSeverities, timeSelection, appNamespace, appName, project, scopedPods]);

  // Fetch containers and pods for dropdowns
  React.useEffect(() => {
    if (!namespace) return;
    fetchLabelValues('container', namespace, appNamespace, appName, project, scopedPods)
      .then((vals) => { if (mountedRef.current) setContainers(vals || []); })
      .catch(() => { if (mountedRef.current) setContainers([]); });
    fetchLabelValues('pod', namespace, appNamespace, appName, project, scopedPods)
      .then((vals) => { if (mountedRef.current) setPods(vals || []); })
      .catch(() => { if (mountedRef.current) setPods([]); });
  }, [namespace, appNamespace, appName, project, scopedPods]);

  // Fetch data when filters change (but not on every keystroke thanks to debounce)
  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    if (paused) return;
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll, paused]);

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

  if (!namespace) {
    return (
      <div style={panel}>
        <EmptyState message="No destination namespace configured for this application" />
      </div>
    );
  }

  if (loading && !loaded) return <Loading />;

  if (error && !loaded) {
    return (
      <div style={panel}>
        <div style={{
          padding: spacing[4],
          color: colors.redText,
          fontFamily: fonts.mono,
          fontSize: fontSize.sm,
          textAlign: 'center',
        }}>
          <div>Failed to load logs: {error}</div>
          <button
            onClick={() => { setLoading(true); fetchAll(); }}
            style={{
              marginTop: spacing[2],
              padding: `${spacing[1]}px ${spacing[3]}px`,
              border: `1px solid ${colors.gray200}`,
              borderRadius: 4,
              backgroundColor: colors.gray100,
              cursor: 'pointer',
              fontFamily: fonts.mono,
              fontSize: fontSize.xs,
              color: colors.gray800,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...panel, maxWidth: '100%', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: 500 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHeader title="LOG EXPLORER" />
        <ScopeToggle value={scope} onChange={setScope} />
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: spacing[3],
        padding: `${spacing[2]}px ${spacing[3]}px`,
        borderBottom: `1px solid ${colors.gray200}`,
        flexShrink: 0,
      }}>
        <MetricCard label="Total Entries" value={String(totalEntries)} unit="lines" />
        <MetricCard label="Errors" value={String(errorCount)} unit="lines" />
        <MetricCard label="Warnings" value={String(warnCount)} unit="lines" />
      </div>

      {/* Pod selector (app view only) */}
      {pods.length > 1 && (
        <div style={{
          padding: `${spacing[1]}px ${spacing[3]}px`,
          borderBottom: `1px solid ${colors.gray200}`,
          display: 'flex',
          alignItems: 'center',
          gap: spacing[2],
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.gray500 }}>Pod:</span>
          <select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            style={{
              fontFamily: fonts.mono,
              fontSize: fontSize.xs,
              padding: `${spacing[1]}px ${spacing[2]}px`,
              border: `1px solid ${colors.gray200}`,
              borderRadius: 4,
              backgroundColor: colors.white,
              color: colors.gray800,
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
        timeSelection={timeSelection}
        onTimeSelectionChange={setTimeSelection}
        onRefresh={fetchAll}
        paused={paused}
        onPauseToggle={() => setPaused((p) => !p)}
      />

      {error && (
        <div style={refreshErrorBanner}>
          Refresh failed: {error}. Showing last loaded data.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {entries.length === 0 ? (
          <EmptyState message={noSeverities
            ? 'No severities selected. Enable at least one severity to see logs.'
            : 'No logs found for the selected filters'} />
        ) : (
          entries.map((entry) => (
            <LogLine key={logEntryKey(entry)} entry={entry} showPod={true} />
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
          gap: spacing[3],
          flexShrink: 0,
        }}>
          <span>
            {entries.length}{totalEntries > entries.length ? ` of ${totalEntries}+` : ''} entries
          </span>
          {errorCount > 0 && (
            <span style={{ color: colors.redText }}>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span style={{ color: colors.yellowText }}>
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const refreshErrorBanner: React.CSSProperties = {
  padding: `${spacing[1]}px ${spacing[3]}px`,
  backgroundColor: colors.yellowLight,
  borderBottom: `1px solid ${colors.yellow}`,
  color: colors.yellowText,
  fontFamily: fonts.mono,
  fontSize: fontSize.xs,
  flexShrink: 0,
};
