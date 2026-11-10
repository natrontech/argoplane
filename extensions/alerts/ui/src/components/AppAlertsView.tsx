import * as React from 'react';
import {
  EmptyState,
  Loading,
  MetricCard,
  SectionHeader,
  colors,
  fontSize,
  input as inputStyle,
  panel,
  spacing,
} from '@argoplane/shared';
import { fetchAlerts, fetchRules } from '../api';
import { AlertsResponse, RulesResponse, Severity, appContext } from '../types';
import { usePolled } from '../hooks/usePolled';
import { AlertsTable } from './AlertsTable';
import { RulesTable } from './RulesTable';
import { Note } from './common';

type View = 'alerts' | 'rules';
type OwnerFilter = 'all' | 'app' | 'platform';

// ArgoCD's stylesheet gives selects full width; fix them to their content so
// the toggles, filters and search share one row.
const select: React.CSSProperties = { ...inputStyle, cursor: 'pointer', width: 'auto', flex: '0 0 auto' };

const toggle = (active: boolean): React.CSSProperties => ({
  ...inputStyle,
  cursor: 'pointer',
  color: active ? colors.orange600 : colors.gray500,
  borderColor: active ? colors.orange500 : colors.gray200,
});

export const AppAlertsView: React.FC<{ application: any; tree?: any }> = ({ application }) => {
  const ctx = appContext(application);
  const [view, setView] = React.useState<View>('alerts');
  const [owner, setOwner] = React.useState<OwnerFilter>('all');
  const [severity, setSeverity] = React.useState<'all' | Severity>('all');
  const [search, setSearch] = React.useState('');

  const { appNamespace, appName, project } = ctx;
  const loadAlerts = React.useCallback(
    (signal: AbortSignal) => fetchAlerts({ appNamespace, appName, project }, {}, signal),
    [appNamespace, appName, project],
  );
  const loadRules = React.useCallback(
    (signal: AbortSignal) => fetchRules({ appNamespace, appName, project }, signal),
    [appNamespace, appName, project],
  );
  const alerts = usePolled<AlertsResponse>(loadAlerts, !!appName);
  const rules = usePolled<RulesResponse>(loadRules, !!appName && view === 'rules');

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (alerts.data?.alerts || []).filter((a) =>
      (owner === 'all' || a.owner === owner) &&
      (severity === 'all' || a.severity === severity) &&
      (!q || a.name.toLowerCase().includes(q) || (a.summary || '').toLowerCase().includes(q) ||
        Object.values(a.labels).some((v) => v.toLowerCase().includes(q))),
    );
  }, [alerts.data, owner, severity, search]);

  const s = alerts.data?.summary;

  return (
    <div style={panel}>
      <div style={{ display: 'flex', gap: spacing[3], marginBottom: spacing[4], flexWrap: 'wrap' }}>
        <MetricCard label="Firing" value={s ? String(s.firing) : '-'} />
        <MetricCard label="Critical" value={s ? String(s.critical) : '-'} />
        <MetricCard label="Warning" value={s ? String(s.warning) : '-'} />
        <MetricCard label="Pending" value={s ? String(s.pending) : '-'} />
        <MetricCard label="Silenced" value={s ? String(s.suppressed) : '-'} />
      </div>

      <div style={{ display: 'flex', gap: spacing[2], alignItems: 'center', marginBottom: spacing[3], flexWrap: 'wrap' }}>
        <button style={toggle(view === 'alerts')} onClick={() => setView('alerts')}>Active alerts</button>
        <button style={toggle(view === 'rules')} onClick={() => setView('rules')}>Rules</button>
        {view === 'alerts' && (
          <>
            <select style={select} value={owner}
              onChange={(e) => setOwner(e.target.value as OwnerFilter)}>
              <option value="all">All owners</option>
              <option value="app">App rules</option>
              <option value="platform">Platform rules</option>
            </select>
            <select style={select} value={severity}
              onChange={(e) => setSeverity(e.target.value as 'all' | Severity)}>
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
              <option value="unknown">Unknown</option>
            </select>
            <input style={{ ...inputStyle, flex: '1 1 200px', minWidth: 200, width: 'auto' }} placeholder="Search name, summary, labels"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </>
        )}
      </div>

      {view === 'alerts' ? (
        <>
          <SectionHeader title="Active alerts" />
          {alerts.data?.warnings?.map((w) => <Note key={w}>{w}</Note>)}
          {alerts.error && alerts.data && <Note>{`Refresh failed: ${alerts.error}. Showing last loaded data.`}</Note>}
          {alerts.loading && !alerts.data ? <Loading /> :
            alerts.error && !alerts.data ? <EmptyState message={`Failed to load alerts: ${alerts.error}`} /> :
            filtered.length === 0 ? (
              <EmptyState message={(alerts.data?.alerts.length || 0) > 0
                ? 'No alerts match the filters'
                : 'No active alerts for this application'} />
            ) : <AlertsTable alerts={filtered} />}
          <div style={{ color: colors.gray500, fontSize: fontSize.xs, marginTop: spacing[3] }}>
            App rules come from PrometheusRules this application deploys. Platform rules come from anywhere else
            and are shown when they fire in one of the application's namespaces.
          </div>
        </>
      ) : (
        <>
          <SectionHeader title="Rules this application deploys" />
          {rules.error && rules.data && <Note>{`Refresh failed: ${rules.error}. Showing last loaded data.`}</Note>}
          {rules.loading && !rules.data ? <Loading /> :
            rules.error && !rules.data ? <EmptyState message={`Failed to load rules: ${rules.error}`} /> :
            (rules.data?.rules.length || 0) === 0
              ? <EmptyState message="This application deploys no alerting rules" />
              : <RulesTable rules={rules.data!.rules} />}
        </>
      )}
    </div>
  );
};
