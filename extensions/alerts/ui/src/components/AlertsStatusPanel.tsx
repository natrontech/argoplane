import * as React from 'react';
import { Status, colors, fontSize, fontWeight, spacing, statusColor } from '@argoplane/shared';
import { fetchAlerts } from '../api';
import { AlertsResponse, Summary, appContext } from '../types';
import { usePolled } from '../hooks/usePolled';

function worst(s: Summary): Status {
  if (s.critical > 0) return 'failed';
  if (s.warning > 0) return 'degraded';
  if (s.firing > 0) return 'in-progress';
  return 'healthy';
}

const label: React.CSSProperties = {
  fontSize: fontSize.xs,
  color: colors.gray500,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: spacing[1],
};

/** Header item: how many of the app's alerts fire right now. */
export const AlertsStatusPanel: React.FC<{ application: any; openFlyout?: () => void }> = ({ application, openFlyout }) => {
  const { appNamespace, appName, project } = appContext(application);
  const load = React.useCallback(
    (signal: AbortSignal) => fetchAlerts({ appNamespace, appName, project }, {}, signal),
    [appNamespace, appName, project],
  );
  const { data, error } = usePolled<AlertsResponse>(load, !!appName);

  let status: Status = 'unknown';
  let text = 'Loading';
  if (data) {
    const s = data.summary;
    status = worst(s);
    text = s.firing === 0 ? 'None firing' : `${s.firing} firing`;
    if (s.pending > 0) text += ` · ${s.pending} pending`;
  } else if (error) {
    text = 'Unavailable';
  }

  return (
    <div
      onClick={() => openFlyout?.()}
      style={{ cursor: openFlyout ? 'pointer' : 'default', padding: `0 ${spacing[2]}px` }}
      title={error || 'Show alerts'}
    >
      <div style={label}>Alerts</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
        <span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: statusColor(status) }} />
        <span>{text}</span>
      </div>
    </div>
  );
};
