import * as React from 'react';
import {
  MetricCard,
  SectionHeader,
  EmptyState,
  ScopeToggle,
  useStickyScope,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
  input as inputStyle,
} from '@argoplane/shared';
import { fetchEvents } from '../api';
import { KubeEvent, SinceRange, SINCE_LABELS } from '../types';
import { EventsTable } from './EventsTable';

interface AppViewProps {
  application: any;
  tree?: any;
}

const REFRESH_INTERVAL = 30_000;

type TypeFilter = 'All' | 'Warning' | 'Normal';

const refreshErrorNote: React.CSSProperties = {
  padding: `${spacing[1]}px ${spacing[3]}px`,
  marginBottom: spacing[3],
  backgroundColor: colors.yellowLight,
  border: `1px solid ${colors.yellow}`,
  borderRadius: 4,
  color: colors.yellowText,
  fontFamily: fonts.mono,
  fontSize: fontSize.xs,
};

export const AppEventsView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [events, setEvents] = React.useState<KubeEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('All');
  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [since, setSince] = React.useState<SinceRange>('1h');
  const [scope, setScope] = useStickyScope();

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // Resources belonging to this app, from the tree. The tree object gets a
  // fresh identity on every app refresh, so key the Set on a stable string.
  const treeKeysStr = React.useMemo(() => {
    if (!tree?.nodes) return '';
    return (tree.nodes as any[])
      .filter((n) => n.namespace === namespace)
      .map((n) => `${n.kind}/${n.name}`)
      .sort()
      .join('|');
  }, [tree, namespace]);
  const treeKeys = React.useMemo(
    () => new Set(treeKeysStr ? treeKeysStr.split('|') : []),
    [treeKeysStr],
  );

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Fetch all event types; type and app-scope filtering happen client-side
    // so the summary cards always reflect unfiltered counts for the scope.
    fetchEvents(
      { namespace, since },
      appNamespace, appName, project,
      controller.signal,
    )
      .then((resp) => {
        if (controller.signal.aborted) return;
        setEvents(resp.events || []);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [namespace, appNamespace, appName, project, since]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // App scoping: keep only events about objects that belong to this app.
  const scopedEvents = React.useMemo(() => {
    if (scope !== 'app' || treeKeys.size === 0) return events;
    return events.filter((e) => treeKeys.has(`${e.involvedObject.kind}/${e.involvedObject.name}`));
  }, [events, scope, treeKeys]);

  // Summary counts over all events in scope, before the type filter.
  const totalCount = scopedEvents.length;
  const warningCount = scopedEvents.filter((e) => e.type === 'Warning').length;
  const normalCount = totalCount - warningCount;

  const filteredEvents = React.useMemo(() => {
    let list = scopedEvents;
    if (typeFilter !== 'All') {
      list = list.filter((e) => e.type === typeFilter);
    }
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      list = list.filter((e) =>
        e.reason.toLowerCase().includes(lower) ||
        e.message.toLowerCase().includes(lower) ||
        e.involvedObject.name.toLowerCase().includes(lower) ||
        e.involvedObject.kind.toLowerCase().includes(lower)
      );
    }
    return list;
  }, [scopedEvents, typeFilter, debouncedSearch]);

  if (!namespace) {
    return React.createElement('div', { style: panel },
      React.createElement(EmptyState, { message: 'No destination namespace configured for this application' }),
    );
  }

  // Summary cards
  const summaryRow = React.createElement('div', {
    style: { display: 'flex', gap: spacing[3], marginBottom: spacing[5], flexWrap: 'wrap' as const },
  },
    React.createElement(MetricCard, { label: 'Total Events', value: String(totalCount) }),
    React.createElement(MetricCard, { label: 'Warnings', value: String(warningCount) }),
    React.createElement(MetricCard, { label: 'Normal', value: String(normalCount) }),
  );

  // Filter bar
  const typeButtons = (['All', 'Warning', 'Normal'] as TypeFilter[]).map((t) =>
    React.createElement('button', {
      key: t,
      onClick: () => setTypeFilter(t),
      style: {
        background: typeFilter === t ? colors.orange500 : colors.gray100,
        color: typeFilter === t ? colors.white : colors.gray600,
        border: `1px solid ${typeFilter === t ? colors.orange600 : colors.gray200}`,
        borderRadius: 2,
        padding: '4px 12px',
        fontSize: fontSize.sm,
        fontWeight: fontWeight.medium,
        cursor: 'pointer',
        fontFamily: 'inherit',
      },
    }, t),
  );

  const sinceOptions = (Object.keys(SINCE_LABELS) as SinceRange[]).map((s) =>
    React.createElement('option', { key: s, value: s }, SINCE_LABELS[s]),
  );

  const filterBar = React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing[3],
      marginBottom: spacing[4],
      flexWrap: 'wrap' as const,
    },
  },
    React.createElement('div', { style: { display: 'flex', gap: spacing[1] } }, ...typeButtons),
    React.createElement('input', {
      type: 'text',
      placeholder: 'Search events...',
      value: searchText,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value),
      style: { ...inputStyle, flex: 1, minWidth: 200 },
    }),
    React.createElement('select', {
      value: since,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setSince(e.target.value as SinceRange),
      style: {
        ...inputStyle,
        cursor: 'pointer',
      },
    }, ...sinceOptions),
  );

  return React.createElement('div', { style: panel },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    },
      React.createElement(SectionHeader, { title: 'Events' }),
      React.createElement(ScopeToggle, { value: scope, onChange: setScope }),
    ),
    summaryRow,
    filterBar,
    // On a failed background refresh keep the table and show an inline note.
    error && loaded && React.createElement('div', { style: refreshErrorNote },
      `Refresh failed: ${error}. Showing last loaded data.`),
    React.createElement(EventsTable, {
      events: filteredEvents,
      loading: loading && !loaded,
      error: loaded ? null : error,
      onRetry: fetchAll,
    }),
  );
};
