import * as React from 'react';

/**
 * Calls fn every `ms` milliseconds while the browser tab is visible, and once
 * right away when the tab becomes visible again. Each call gets a fresh
 * AbortSignal and aborts the previous call's, so a slow response can never
 * overwrite a newer one. Does not fire on mount: callers do their own first
 * fetch.
 */
export function useVisibleInterval(fn: (signal: AbortSignal) => void, ms: number, enabled = true): void {
  React.useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | undefined;
    const tick = () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      fn(controller.signal);
    };
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      controller?.abort();
    };
  }, [fn, ms, enabled]);
}
