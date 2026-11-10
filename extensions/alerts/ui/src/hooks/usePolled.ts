import * as React from 'react';
import { useVisibleInterval } from '@argoplane/shared';

const REFRESH_INTERVAL = 30_000;

export interface Polled<T> {
  data: T | null;
  /** The last error. With data present, it came from a background refresh. */
  error: string | null;
  loading: boolean;
}

/**
 * Loads once, then refreshes every 30s while the tab is visible. A newer call
 * aborts the older one, so a slow response never overwrites a fresh one.
 * `load` must be memoised: a new identity starts over.
 */
export function usePolled<T>(load: (signal: AbortSignal) => Promise<T>, enabled = true): Polled<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const abortRef = React.useRef<AbortController | null>(null);

  const run = React.useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    load(controller.signal)
      .then((d) => { if (!controller.signal.aborted) { setData(d); setError(null); } })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [load]);

  React.useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    setData(null);
    run();
    return () => abortRef.current?.abort();
  }, [run, enabled]);

  useVisibleInterval(run, REFRESH_INTERVAL, enabled);

  return { data, error, loading };
}
