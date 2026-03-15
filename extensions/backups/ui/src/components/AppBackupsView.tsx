import * as React from 'react';
import {
  Loading,
  EmptyState,
  Tag,
  Button,
  ProgressBar,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchOverview, fetchBackups, fetchRestores, createBackup, createRestore } from '../api';
import {
  ScheduleSummary,
  BackupSummary,
  RestoreSummary,
  StorageLocationSummary,
  OverviewResponse,
  ResourceRef,
} from '../types';

// ============================================================
// ArgoCD SPA-safe navigation
// ============================================================

function resourceNodeUrl(appNs: string, appName: string, group: string, kind: string, ns: string, name: string): string {
  const nodeKey = `${group}/${kind}/${ns}/${name}/0`;
  return `/applications/${appNs}/${appName}?${new URLSearchParams({ node: nodeKey }).toString()}`;
}

function navigateSPA(url: string) {
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// ============================================================
// Helpers
// ============================================================

function timeAgo(iso?: string): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function duration(start?: string, end?: string): string {
  if (!start) return '-';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.max(0, e - s);
  const totalSecs = Math.floor(diff / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

type PhaseVariant = 'green' | 'red' | 'orange' | 'gray';

function phaseToVariant(phase: string): PhaseVariant {
  switch (phase) {
    case 'Completed': return 'green';
    case 'Failed': case 'PartiallyFailed': return 'red';
    case 'InProgress': case 'New': case 'WaitingForPluginOperations': case 'WaitingForPluginOperationsPartiallyFailed': return 'orange';
    default: return 'gray';
  }
}

function bslStatus(locations: StorageLocationSummary[]): { available: boolean; label: string } {
  if (locations.length === 0) return { available: false, label: 'No Storage' };
  const available = locations.some((l) => l.phase === 'Available');
  return { available, label: available ? 'Storage: Available' : 'Storage: Unavailable' };
}

function hasInProgress(backups: BackupSummary[], restores: RestoreSummary[]): boolean {
  return backups.some((b) => b.phase === 'InProgress' || b.phase === 'New') ||
    restores.some((r) => r.phase === 'InProgress' || r.phase === 'New');
}

// ============================================================
// Sub-components
// ============================================================

const ResourceLink: React.FC<{ onClick: () => void; children: React.ReactNode; title?: string }> = ({ onClick, children, title }) => (
  <span onClick={(e) => { e.stopPropagation(); onClick(); }} title={title} style={linkStyle}>{children}</span>
);

const Sep: React.FC = () => <span style={{ width: 1, height: 16, background: colors.gray200, flexShrink: 0 }} />;

const StatusDot: React.FC<{ ok: boolean }> = ({ ok }) => (
  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 1, background: ok ? colors.greenSolid : colors.redSolid, marginRight: 6, flexShrink: 0 }} />
);

// ============================================================
// Main component
// ============================================================

const REFRESH_NORMAL = 30_000;
const REFRESH_FAST = 5_000;

export const AppBackupsView: React.FC<{ application: any; tree?: any }> = ({ application, tree }) => {
  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  const [allBackups, setAllBackups] = React.useState<BackupSummary[]>([]);
  const [allRestores, setAllRestores] = React.useState<RestoreSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'schedules' | 'backups' | 'restores'>('schedules');
  const [creating, setCreating] = React.useState(false);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.namespace === namespace || !n.namespace)
      .map((n: any) => ({ group: n.group || '', kind: n.kind, namespace: n.namespace || '', name: n.name }));
  }, [tree, namespace]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;
    Promise.all([
      fetchOverview(namespace, resourceRefs, appNamespace, appName, project).catch(() => null),
      fetchBackups(namespace, appNamespace, appName, project).catch(() => [] as BackupSummary[]),
      fetchRestores(namespace, appNamespace, appName, project).catch(() => [] as RestoreSummary[]),
    ]).then(([ov, bk, rs]) => {
      if (ov) setOverview(ov);
      setAllBackups(bk);
      setAllRestores(rs);
      setError(null);
    }).catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, resourceRefs]);

  React.useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);

  // Auto-refresh: fast when in-progress, normal otherwise
  const refreshInterval = React.useMemo(
    () => hasInProgress(allBackups, allRestores) ? REFRESH_FAST : REFRESH_NORMAL,
    [allBackups, allRestores]
  );
  React.useEffect(() => { const i = setInterval(fetchAll, refreshInterval); return () => clearInterval(i); }, [fetchAll, refreshInterval]);

  const schedules = overview?.schedules || [];
  const storageLocations = overview?.storageLocations || [];
  const bsl = React.useMemo(() => bslStatus(storageLocations), [storageLocations]);

  const handleCreateBackup = React.useCallback(async () => {
    setCreating(true);
    try {
      await createBackup(namespace, appNamespace, appName, project);
      setTimeout(fetchAll, 2000);
    } catch {
      // silently fail, user can retry
    } finally {
      setCreating(false);
    }
  }, [namespace, appNamespace, appName, project, fetchAll]);

  const handleRestore = React.useCallback(async (backupName: string) => {
    try {
      await createRestore(backupName, namespace, appNamespace, appName, project);
      setTimeout(fetchAll, 2000);
    } catch {
      // silently fail
    }
  }, [namespace, appNamespace, appName, project, fetchAll]);

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return (
    <div style={panel}>
      <div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div>
      <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
    </div>
  );

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div style={topBar}>
        <div style={topLeft}>
          <span style={appLabelS}>{appName}</span>
          <span style={nsLabelS}>{namespace}</span>
          <Sep />
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot ok={bsl.available} />
            <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, color: bsl.available ? colors.greenText : colors.redText }}>{bsl.label}</span>
          </span>
        </div>
        <div style={topRight}>
          <Button primary onClick={handleCreateBackup} disabled={creating}>
            {creating ? 'Creating...' : 'Create Backup'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={tabBar}>
        <button style={tab(activeTab === 'schedules')} onClick={() => setActiveTab('schedules')}>
          Schedules ({schedules.length})
        </button>
        <button style={tab(activeTab === 'backups')} onClick={() => setActiveTab('backups')}>
          Backups ({allBackups.length})
        </button>
        {allRestores.length > 0 && (
          <button style={tab(activeTab === 'restores')} onClick={() => setActiveTab('restores')}>
            Restores ({allRestores.length})
          </button>
        )}
      </div>

      {/* === Schedules tab === */}
      {activeTab === 'schedules' && (
        <div style={tabContent}>
          {schedules.length === 0 ? (
            <EmptyState message="No Velero schedules found for this namespace" />
          ) : (
            <div style={tableWrap}>
              <table style={tableStyle}>
                <thead><tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Cron</th>
                  <th style={thStyle}>Paused</th>
                  <th style={thStyle}>Last Backup</th>
                  <th style={thStyle}>TTL</th>
                  <th style={thStyle}>Owner</th>
                  <th style={thStyle}>Backups</th>
                </tr></thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.name}>
                      <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>
                        <ResourceLink
                          onClick={() => navigateSPA(resourceNodeUrl(appNamespace, appName, 'velero.io', 'Schedule', s.namespace, s.name))}
                          title={`Open ${s.name}`}
                        >
                          {s.name}
                        </ResourceLink>
                      </td>
                      <td style={tdStyle}>{s.cron}</td>
                      <td style={tdStyle}>{s.paused ? <Tag variant="orange">Yes</Tag> : <span style={{ color: colors.gray400 }}>No</span>}</td>
                      <td style={tdStyle}>
                        {s.lastBackupTime ? (
                          <span>
                            {timeAgo(s.lastBackupTime)}
                            {s.lastBackupStatus && (
                              <span style={{ marginLeft: 6 }}>
                                <Tag variant={phaseToVariant(s.lastBackupStatus)}>{s.lastBackupStatus}</Tag>
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: colors.gray400 }}>-</span>
                        )}
                      </td>
                      <td style={tdStyle}>{s.ttl || '-'}</td>
                      <td style={tdStyle}>
                        <Tag variant={s.ownership === 'app' ? 'green' : 'gray'}>
                          {s.ownership === 'app' ? 'App' : 'Platform'}
                        </Tag>
                      </td>
                      <td style={tdStyle}>{s.backupCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* === Backups tab === */}
      {activeTab === 'backups' && (
        <div style={tabContent}>
          {allBackups.length === 0 ? (
            <EmptyState message="No backups found for this namespace" />
          ) : (
            <div style={tableWrap}>
              <table style={tableStyle}>
                <thead><tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Phase</th>
                  <th style={thStyle}>Schedule</th>
                  <th style={thStyle}>Started</th>
                  <th style={thStyle}>Duration</th>
                  <th style={thStyle}>Items</th>
                  <th style={thStyle}>Errors</th>
                  <th style={thStyle}>Warnings</th>
                  <th style={thStyle}>Actions</th>
                </tr></thead>
                <tbody>
                  {allBackups.map((b) => {
                    const inProgress = b.phase === 'InProgress' || b.phase === 'New';
                    const itemPercent = b.totalItems > 0 ? Math.round((b.itemsBackedUp / b.totalItems) * 100) : 0;
                    return (
                      <tr key={b.name}>
                        <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>
                          <ResourceLink
                            onClick={() => navigateSPA(resourceNodeUrl(appNamespace, appName, 'velero.io', 'Backup', b.namespace, b.name))}
                            title={`Open ${b.name}`}
                          >
                            {b.name}
                          </ResourceLink>
                        </td>
                        <td style={tdStyle}><Tag variant={phaseToVariant(b.phase)}>{b.phase}</Tag></td>
                        <td style={tdStyle}>{b.scheduleName || '-'}</td>
                        <td style={tdStyle}>{timeAgo(b.startTimestamp)}</td>
                        <td style={tdStyle}>{duration(b.startTimestamp, b.completionTimestamp)}</td>
                        <td style={tdStyle}>
                          {inProgress && b.totalItems > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], minWidth: 100 }}>
                              <ProgressBar percent={itemPercent} />
                              <span style={{ fontSize: fontSize.xs, color: colors.gray500 }}>{b.itemsBackedUp}/{b.totalItems}</span>
                            </div>
                          ) : (
                            <span>{b.itemsBackedUp}/{b.totalItems}</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: b.errors > 0 ? colors.redText : colors.gray400 }}>{b.errors}</td>
                        <td style={{ ...tdStyle, color: b.warnings > 0 ? colors.yellowText : colors.gray400 }}>{b.warnings}</td>
                        <td style={tdStyle}>
                          {b.phase === 'Completed' && (
                            <Button onClick={() => handleRestore(b.name)}>Restore</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* === Restores tab === */}
      {activeTab === 'restores' && (
        <div style={tabContent}>
          {allRestores.length === 0 ? (
            <EmptyState message="No restores found" />
          ) : (
            <div style={tableWrap}>
              <table style={tableStyle}>
                <thead><tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Phase</th>
                  <th style={thStyle}>Backup</th>
                  <th style={thStyle}>Started</th>
                  <th style={thStyle}>Duration</th>
                  <th style={thStyle}>Items</th>
                  <th style={thStyle}>Errors</th>
                  <th style={thStyle}>Warnings</th>
                </tr></thead>
                <tbody>
                  {allRestores.map((r) => {
                    const inProgress = r.phase === 'InProgress' || r.phase === 'New';
                    const itemPercent = r.totalItems > 0 ? Math.round((r.itemsRestored / r.totalItems) * 100) : 0;
                    return (
                      <tr key={r.name}>
                        <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>{r.name}</td>
                        <td style={tdStyle}><Tag variant={phaseToVariant(r.phase)}>{r.phase}</Tag></td>
                        <td style={tdStyle}>
                          <ResourceLink
                            onClick={() => navigateSPA(resourceNodeUrl(appNamespace, appName, 'velero.io', 'Backup', r.namespace, r.backupName))}
                            title={`Open ${r.backupName}`}
                          >
                            {r.backupName}
                          </ResourceLink>
                        </td>
                        <td style={tdStyle}>{timeAgo(r.startTimestamp)}</td>
                        <td style={tdStyle}>{duration(r.startTimestamp, r.completionTimestamp)}</td>
                        <td style={tdStyle}>
                          {inProgress && r.totalItems > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], minWidth: 100 }}>
                              <ProgressBar percent={itemPercent} />
                              <span style={{ fontSize: fontSize.xs, color: colors.gray500 }}>{r.itemsRestored}/{r.totalItems}</span>
                            </div>
                          ) : (
                            <span>{r.itemsRestored}/{r.totalItems}</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: r.errors > 0 ? colors.redText : colors.gray400 }}>{r.errors}</td>
                        <td style={{ ...tdStyle, color: r.warnings > 0 ? colors.yellowText : colors.gray400 }}>{r.warnings}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Styles (matching networking extension pattern)
// ============================================================

const rootStyle: React.CSSProperties = { ...panel, overflow: 'hidden', maxWidth: '100%', display: 'flex', flexDirection: 'column', height: '100%' };
const topBar: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2], paddingBottom: spacing[3], borderBottom: `1px solid ${colors.gray200}`, flexShrink: 0 };
const topLeft: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[3], flexWrap: 'wrap' };
const topRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing[2] };
const appLabelS: React.CSSProperties = { fontFamily: fonts.mono, fontWeight: fontWeight.semibold, fontSize: fontSize.md, color: colors.gray800 };
const nsLabelS: React.CSSProperties = { fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.gray400 };
const tabBar: React.CSSProperties = { display: 'flex', gap: 0, borderBottom: `1px solid ${colors.gray200}`, marginTop: spacing[3], flexShrink: 0 };
const tab = (active: boolean): React.CSSProperties => ({ padding: `${spacing[2]}px ${spacing[4]}px`, border: 'none', borderBottom: active ? `2px solid ${colors.orange500}` : '2px solid transparent', background: 'transparent', color: active ? colors.gray800 : colors.gray400, fontWeight: active ? fontWeight.semibold : fontWeight.medium, fontSize: fontSize.sm, fontFamily: fonts.mono, cursor: 'pointer' });
const tabContent: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: spacing[3] };
const tableWrap: React.CSSProperties = { overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', borderSpacing: 0 };
const thStyle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.gray500, padding: `${spacing[2]}px ${spacing[2]}px`, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { fontSize: fontSize.sm, padding: `${spacing[1]}px ${spacing[2]}px`, borderBottom: `1px solid ${colors.gray100}`, fontFamily: fonts.mono, whiteSpace: 'nowrap' };
const linkStyle: React.CSSProperties = { fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.blueText, cursor: 'pointer', borderBottom: `1px dotted ${colors.blueText}` };
