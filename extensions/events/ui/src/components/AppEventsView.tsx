import * as React from 'react';
import {
  MetricCard,
  SectionHeader,
  colors,
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

export const AppEventsView: React.FC<AppViewProps> = ({ application }) => {
  const [events, setEvents] = React.useState<KubeEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);
  const [warningCount, setWarningCount] = React.useState(0);
  const [normalCount, setNormalCount] = React.useState(0);

  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('All');
  const [searchText, setSearchText] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [since, setSince] = React.useState<SinceRange>('1h');

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;

    const typeParam = typeFilter === 'All' ? undefined : typeFilter;

    fetchEvents(
      { namespace, type: typeParam, since },
      appNamespace, appName, project,
    )
      .then((resp) => {
        setEvents(resp.events || []);
        setTotalCount(resp.summary.total);
        setWarningCount(resp.summary.warnings);
        setNormalCount(resp.summary.normal);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, typeFilter, since]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const filteredEvents = React.useMemo(() => {
    if (!debouncedSearch) return events;
    const lower = debouncedSearch.toLowerCase();
    return events.filter((e) =>
      e.reason.toLowerCase().includes(lower) ||
      e.message.toLowerCase().includes(lower) ||
      e.involvedObject.name.toLowerCase().includes(lower) ||
      e.involvedObject.kind.toLowerCase().includes(lower)
    );
  }, [events, debouncedSearch]);

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
    React.createElement(SectionHeader, { title: 'Events' }),
    summaryRow,
    filterBar,
    React.createElement(EventsTable, {
      events: filteredEvents,
      loading,
      error,
      onRetry: fetchAll,
    }),
  );
};
