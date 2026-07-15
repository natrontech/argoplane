import * as React from 'react';
import {
  Loading,
  EmptyState,
  colors,
  fonts,
  fontSize,
  panel,
  spacing,
} from '@argoplane/shared';
import { fetchLogs, fetchLabelValues } from '../api';
import { ExtensionProps, LogEntry, Severity, TimeSelection, logEntryKey, resolveTimeSelection } from '../types';
import { LogLine } from './LogLine';
import { LogToolbar } from './LogToolbar';

const REFRESH_INTERVAL = 30_000;
const DEFAULT_LIMIT = 500;

/** Pods in the resource tree that descend from the given resource (via parentRefs). */
function podsForResource(tree: any, kind: string, name: string, namespace: string): string[] {
  const nodes: any[] = tree?.nodes || [];
  const owned = new Set([`${kind}/${name}`]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      const key = `${n.kind}/${n.name}`;
      if (owned.has(key) || n.namespace !== namespace) continue;
      if ((n.parentRefs || []).some((p: any) => owned.has(`${p.kind}/${p.name}`))) {
        owned.add(key);
        grew = true;
      }
    }
  }
  return nodes
    .filter((n) => n.kind === 'Pod' && n.namespace === namespace && owned.has(`Pod/${n.name}`))
    .map((n) => n.name as string);
}

export const LogsPanel: React.FC<ExtensionProps> = ({ resource, tree, application }) => {
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [containers, setContainers] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [totalEntries, setTotalEntries] = React.useState(0);

  const [selectedContainer, setSelectedContainer] = React.useState('');
  const [activeSeverities, setActiveSeverities] = React.useState<Set<Severity>>(
    new Set(['debug', 'info', 'warn', 'error'])
  );
  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [timeSelection, setTimeSelection] = React.useState<TimeSelection>({
    type: 'relative',
    relative: '1h',
  });

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || 'Pod';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const isPod = kind === 'Pod';
  const showPod = !isPod;

  // The tree object gets a fresh identity on every app refresh, so derive a
  // stable string key from the pod names and memoize the array on that.
  const podsKey = (isPod ? [name] : podsForResource(tree, kind, name, namespace)).join('|');
  const podNames = React.useMemo(() => (podsKey ? podsKey.split('|') : []), [podsKey]);

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
    if (!namespace || !name) {
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
      ...(isPod ? { pod: name } : { resource: name, kind }),
      container: selectedContainer || undefined,
      filter: debouncedSearch || undefined,
      severity: severityFilter,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: DEFAULT_LIMIT,
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
  }, [namespace, name, kind, isPod, selectedContainer, debouncedSearch, activeSeverities, timeSelection, appNamespace, appName, project]);

  // Fetch containers for the dropdown, scoped to this resource's pods
  React.useEffect(() => {
    if (!namespace) return;
    fetchLabelValues('container', namespace, appNamespace, appName, project, podNames.length > 0 ? podNames : undefined)
      .then((vals) => { if (mountedRef.current) setContainers(vals || []); })
      .catch(() => { if (mountedRef.current) setContainers([]); });
  }, [namespace, appNamespace, appName, project, podNames]);

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

  // Severity counts for footer
  const errorCount = entries.filter((e) => e.severity === 'error').length;
  const warnCount = entries.filter((e) => e.severity === 'warn').length;

  if (!namespace || !name) {
    return (
      <div style={panel}>
        <EmptyState message="No namespace or name available for this resource" />
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
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)', minHeight: 400 }}>
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
            <LogLine key={logEntryKey(entry)} entry={entry} showPod={showPod} />
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
