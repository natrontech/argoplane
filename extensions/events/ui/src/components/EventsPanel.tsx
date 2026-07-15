import * as React from 'react';
import {
  SectionHeader,
  EmptyState,
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

export const EventsPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [events, setEvents] = React.useState<KubeEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [since, setSince] = React.useState<SinceRange>('1h');

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const fetchAll = React.useCallback(() => {
    if (!namespace || !name || !kind) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetchEvents(
      { namespace, kind, name, since },
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

  if (!namespace || !name || !kind) {
    return React.createElement('div', { style: panel },
      React.createElement(EmptyState, { message: 'No namespace or name available for this resource' }),
    );
  }

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
    // On a failed background refresh keep the table and show an inline note.
    error && loaded && React.createElement('div', { style: refreshErrorNote },
      `Refresh failed: ${error}. Showing last loaded data.`),
    React.createElement(EventsTable, {
      events,
      loading: loading && !loaded,
      error: loaded ? null : error,
      onRetry: fetchAll,
    }),
  );
};
