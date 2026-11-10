import * as React from 'react';
import { EmptyState, Loading, SectionHeader, panel } from '@argoplane/shared';
import { fetchAlerts } from '../api';
import { AlertsResponse, appContext } from '../types';
import { usePolled } from '../hooks/usePolled';
import { AlertsTable } from './AlertsTable';
import { Note } from './common';

/** Resource tab: active alerts about one workload or pod. */
export const AlertsPanel: React.FC<{ resource: any; application: any }> = ({ resource, application }) => {
  const { appNamespace, appName, project } = appContext(application);
  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || '';

  const load = React.useCallback(
    (signal: AbortSignal) => fetchAlerts({ appNamespace, appName, project }, { namespace, kind, name }, signal),
    [appNamespace, appName, project, namespace, kind, name],
  );
  const enabled = !!(namespace && name && kind && appName);
  const { data, error, loading } = usePolled<AlertsResponse>(load, enabled);

  if (!enabled) {
    return <div style={panel}><EmptyState message="No namespace or name available for this resource" /></div>;
  }

  return (
    <div style={panel}>
      <SectionHeader title={`Alerts for ${kind}/${name}`} />
      {data?.warnings?.map((w) => <Note key={w}>{w}</Note>)}
      {error && data && <Note>{`Refresh failed: ${error}. Showing last loaded data.`}</Note>}
      {loading && !data ? <Loading /> :
        error && !data ? <EmptyState message={`Failed to load alerts: ${error}`} /> :
        (data?.alerts.length || 0) === 0
          ? <EmptyState message={`No active alerts for ${kind}/${name}`} />
          : <AlertsTable alerts={data!.alerts} />}
    </div>
  );
};
