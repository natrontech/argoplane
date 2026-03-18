import * as React from 'react';
import {
  SectionHeader,
  spacing,
  panel,
  input as inputStyle,
  fonts,
  fontSize,
  fontWeight,
  colors,
} from '@argoplane/shared';
import { fetchEvents } from '../api';
import { KubeEvent, SinceRange, SINCE_LABELS, ExtensionProps } from '../types';
import { EventsTable } from './EventsTable';

const REFRESH_INTERVAL = 30_000;

export const EventsPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [events, setEvents] = React.useState<KubeEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [since, setSince] = React.useState<SinceRange>('1h');

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const fetchAll = React.useCallback(() => {
    if (!namespace || !name || !kind) return;

    fetchEvents(
      { namespace, kind, name, since },
      appNamespace, appName, project,
    )
      .then((resp) => {
        setEvents(resp.events || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, name, kind, appNamespace, appName, project, since]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const sinceOptions = (Object.keys(SINCE_LABELS) as SinceRange[]).map((s) =>
    React.createElement('option', { key: s, value: s }, SINCE_LABELS[s]),
  );

  return React.createElement('div', { style: panel },
    React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing[4],
      },
    },
      React.createElement(SectionHeader, { title: `Events for ${kind}/${name}` }),
      React.createElement('select', {
        value: since,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setSince(e.target.value as SinceRange),
        style: { ...inputStyle, cursor: 'pointer' },
      }, ...sinceOptions),
    ),
    React.createElement(EventsTable, {
      events,
      loading,
      error,
      onRetry: fetchAll,
    }),
  );
};
