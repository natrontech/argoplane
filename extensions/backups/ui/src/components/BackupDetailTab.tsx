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
import { fetchRestores, createRestore, fetchLogs, fetchPodVolumeBackups, deleteBackup } from '../api';
import { RestoreSummary, PodVolumeBackupSummary } from '../types';
import { LogViewer } from './LogViewer';

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
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

// ============================================================
// Sub-components
// ============================================================

const KV: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={kvRow}>
    <span style={kvLabel}>{label}</span>
    <span style={kvValue}>{value}</span>
  </div>
);

// ============================================================
// Main component
// ============================================================

const REFRESH_INTERVAL = 5_000;

export const BackupDetailTab: React.FC<{ resource: any; tree?: any; application: any }> = ({ resource, tree, application }) => {
  const [restores, setRestores] = React.useState<RestoreSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [restoring, setRestoring] = React.useState(false);

  const backupName = resource?.metadata?.name || '';
  const backupNs = resource?.metadata?.namespace || '';
  const phase = resource?.status?.phase || 'Unknown';
  const startTimestamp = resource?.status?.startTimestamp || resource?.metadata?.creationTimestamp || '';
  const completionTimestamp = resource?.status?.completionTimestamp || '';
  const expiresAt = resource?.status?.expiration || '';
  const itemsBackedUp = resource?.status?.progress?.itemsBackedUp || 0;
  const totalItems = resource?.status?.progress?.totalItems || 0;
  const volumeSnapshotsAttempted = resource?.status?.volumeSnapshotsAttempted || 0;
  const volumeSnapshotsCompleted = resource?.status?.volumeSnapshotsCompleted || 0;
  const errors = resource?.status?.errors || 0;
  const warnings = resource?.status?.warnings || 0;
  const failureReason = resource?.status?.failureReason || '';
  const validationErrors: string[] = resource?.status?.validationErrors || [];

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const [logsLoading, setLogsLoading] = React.useState(false);
  const [logsError, setLogsError] = React.useState<string | null>(null);
  const [logsContent, setLogsContent] = React.useState<{ title: string; text: string } | null>(null);
  const [pvbs, setPvbs] = React.useState<PodVolumeBackupSummary[]>([]);
  const [pvbsLoaded, setPvbsLoaded] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteMsg, setDeleteMsg] = React.useState<string | null>(null);
  const inProgress = phase === 'InProgress' || phase === 'New';
  const itemPercent = totalItems > 0 ? Math.round((itemsBackedUp / totalItems) * 100) : 0;

  React.useEffect(() => {
    fetchPodVolumeBackups(backupName, appNamespace, appName, project)
      .then(setPvbs)
      .catch(() => setPvbs([]))
      .finally(() => setPvbsLoaded(true));
  }, [backupName, appNamespace, appName, project]);

  const handleDelete = React.useCallback(async () => {
    setDeleting(true);
    try {
      await deleteBackup(backupName, appNamespace, appName, project);
      setDeleteMsg(`Delete request created for backup "${backupName}".`);
      setConfirmDelete(false);
    } catch (err: any) {
      setDeleteMsg(`Failed to delete: ${err.message || 'unknown error'}`);
    }
    setDeleting(false);
  }, [backupName, appNamespace, appName, project]);

  const openLogs = React.useCallback(async (kind: 'BackupLog' | 'BackupResults') => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const result = await fetchLogs(backupName, kind, appNamespace, appName, project);
      setLogsContent({ title: kind === 'BackupLog' ? 'Backup Logs' : 'Backup Results', text: result.content });
    } catch (err: any) {
      setLogsError(`Could not fetch ${kind === 'BackupLog' ? 'logs' : 'results'}: ${err.message || 'unknown error'}. Velero DownloadRequest CRD may not be installed.`);
    }
    setLogsLoading(false);
  }, [backupName, appNamespace, appName, project]);

  const loadRestores = React.useCallback(() => {
    if (!backupNs) return;
    fetchRestores(backupNs, appNamespace, appName, project, backupName)
      .then(setRestores)
      .catch(() => setRestores([]))
      .finally(() => setLoading(false));
  }, [backupNs, appNamespace, appName, project, backupName]);

  React.useEffect(() => { setLoading(true); loadRestores(); }, [loadRestores]);

  // Auto-refresh when backup is in-progress
  React.useEffect(() => {
    if (!inProgress) return;
    const i = setInterval(loadRestores, REFRESH_INTERVAL);
    return () => clearInterval(i);
  }, [inProgress, loadRestores]);

  const [restoreError, setRestoreError] = React.useState<string | null>(null);

  const handleRestore = React.useCallback(async () => {
    setRestoring(true);
    setRestoreError(null);
    try {
      await createRestore(backupName, backupNs, appNamespace, appName, project);
      setTimeout(loadRestores, 2000);
    } catch (err: any) {
      setRestoreError(`Failed to create restore: ${err.message || 'unknown error'}`);
    } finally {
      setRestoring(false);
    }
  }, [backupName, backupNs, appNamespace, appName, project, loadRestores]);

  return (
    <div style={rootStyle}>
      {/* Backup metadata */}
      <div style={metaSection}>
        <div style={metaGrid}>
          <KV label="Backup" value={backupName} />
          <KV label="Phase" value={<Tag variant={phaseToVariant(phase)}>{phase}</Tag>} />
          <KV label="Started" value={startTimestamp ? `${timeAgo(startTimestamp)} (${new Date(startTimestamp).toLocaleString()})` : '-'} />
          <KV label="Completed" value={completionTimestamp ? `${timeAgo(completionTimestamp)} (${new Date(completionTimestamp).toLocaleString()})` : inProgress ? 'In progress...' : '-'} />
          <KV label="Duration" value={duration(startTimestamp, completionTimestamp)} />
          {expiresAt && <KV label="Expires" value={new Date(expiresAt).toLocaleString()} />}
        </div>
      </div>

      {/* Progress section */}
      <div style={progressSection}>
        <div style={{ display: 'flex', gap: spacing[6], alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={progressLabel}>Items</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
              {inProgress && totalItems > 0 ? (
                <>
                  <div style={{ flex: 1 }}><ProgressBar percent={itemPercent} /></div>
                  <span style={progressCount}>{itemsBackedUp}/{totalItems} ({itemPercent}%)</span>
                </>
              ) : (
                <span style={progressCount}>{itemsBackedUp}/{totalItems}</span>
              )}
            </div>
          </div>
          <div>
            <div style={progressLabel}>Volume Snapshots</div>
            <span style={progressCount}>{volumeSnapshotsCompleted}/{volumeSnapshotsAttempted}</span>
          </div>
          <div>
            <div style={progressLabel}>Errors</div>
            <span style={{ ...progressCount, color: errors > 0 ? colors.redText : colors.gray400 }}>{errors}</span>
          </div>
          <div>
            <div style={progressLabel}>Warnings</div>
            <span style={{ ...progressCount, color: warnings > 0 ? colors.yellowText : colors.gray400 }}>{warnings}</span>
          </div>
        </div>
      </div>

      {/* PodVolumeBackups */}
      {pvbsLoaded && pvbs.length > 0 && (
        <div style={{ paddingBottom: spacing[4], borderBottom: `1px solid ${colors.gray200}`, marginBottom: spacing[4] }}>
          <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: spacing[2] }}>
            File-System Backups ({pvbs.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
              <thead><tr>
                <th style={thStyle}>Phase</th>
                <th style={thStyle}>Pod</th>
                <th style={thStyle}>Volume</th>
                <th style={thStyle}>Uploader</th>
                <th style={thStyle}>Progress</th>
                <th style={thStyle}>Started</th>
              </tr></thead>
              <tbody>
                {pvbs.map((pvb) => (
                  <tr key={pvb.name}>
                    <td style={tdStyle}><Tag variant={phaseToVariant(pvb.phase)}>{pvb.phase}</Tag></td>
                    <td style={tdStyle}>{pvb.podNamespace}/{pvb.podName}</td>
                    <td style={tdStyle}>{pvb.volume}</td>
                    <td style={tdStyle}>{pvb.uploaderType || '-'}</td>
                    <td style={tdStyle}>
                      {pvb.totalBytes > 0 ? (
                        <span>{formatBytes(pvb.bytesDone)} / {formatBytes(pvb.totalBytes)}</span>
                      ) : '-'}
                    </td>
                    <td style={tdStyle}>{timeAgo(pvb.startTimestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Errors & warnings detail */}
      {failureReason && (
        <div style={alertBoxStyle}>
          <span style={{ fontWeight: fontWeight.semibold }}>Failure:</span> {failureReason}
        </div>
      )}
      {validationErrors.length > 0 && (
        <div style={alertBoxStyle}>
          <span style={{ fontWeight: fontWeight.semibold }}>Validation errors:</span>
          <ul style={{ margin: `${spacing[1]}px 0 0 ${spacing[4]}px`, padding: 0 }}>
            {validationErrors.map((e: string, i: number) => <li key={i} style={{ fontSize: fontSize.sm }}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: spacing[2], marginBottom: spacing[4], flexWrap: 'wrap', alignItems: 'center' }}>
        {phase === 'Completed' && (
          <Button primary onClick={handleRestore} disabled={restoring}>
            {restoring ? 'Restoring...' : 'Restore from this Backup'}
          </Button>
        )}
        {(phase === 'Completed' || phase === 'PartiallyFailed' || phase === 'Failed') && (
          <>
            <Button onClick={() => openLogs('BackupLog')} disabled={logsLoading}>
              {logsLoading ? 'Loading...' : 'View Logs'}
            </Button>
            {(errors > 0 || warnings > 0) && (
              <Button onClick={() => openLogs('BackupResults')} disabled={logsLoading}>
                View Results
              </Button>
            )}
            {!confirmDelete ? (
              <Button danger onClick={() => setConfirmDelete(true)}>Delete Backup</Button>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
                <span style={{ fontSize: fontSize.sm, color: colors.redText }}>Delete "{backupName}"?</span>
                <Button danger onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Confirm'}</Button>
                <Button onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
              </span>
            )}
          </>
        )}
      </div>

      {/* Delete message */}
      {deleteMsg && (
        <div style={{ marginBottom: spacing[4], padding: spacing[3], background: deleteMsg.startsWith('Failed') ? colors.redLight : '#E8F5E9', border: `1px solid ${deleteMsg.startsWith('Failed') ? colors.red : '#66BB6A'}`, borderRadius: 4, fontSize: fontSize.sm, fontFamily: fonts.mono, color: deleteMsg.startsWith('Failed') ? colors.redText : '#2E7D32' }}>
          {deleteMsg}
        </div>
      )}

      {/* Error messages */}
      {logsError && (
        <div style={{ ...alertBoxStyle, background: '#FFF8E1', borderColor: '#FFD54F', color: '#8D6E00', marginBottom: spacing[4] }}>
          {logsError}
        </div>
      )}
      {restoreError && (
        <div style={alertBoxStyle}>
          {restoreError}
        </div>
      )}

      {/* Inline log viewer */}
      {logsContent && (
        <div style={{ marginBottom: spacing[4] }}>
          <LogViewer title={logsContent.title} content={logsContent.text} onClose={() => setLogsContent(null)} />
        </div>
      )}

      {/* Restores from this backup */}
      <div style={sectionTitle}>RESTORES FROM THIS BACKUP</div>

      {loading ? (
        <Loading />
      ) : restores.length === 0 ? (
        <EmptyState message="No restores found for this backup" />
      ) : (
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead><tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Phase</th>
              <th style={thStyle}>Started</th>
              <th style={thStyle}>Duration</th>
              <th style={thStyle}>Items</th>
              <th style={thStyle}>Errors</th>
              <th style={thStyle}>Warnings</th>
            </tr></thead>
            <tbody>
              {restores.map((r) => {
                const rInProgress = r.phase === 'InProgress' || r.phase === 'New';
                const rPercent = r.totalItems > 0 ? Math.round((r.itemsRestored / r.totalItems) * 100) : 0;
                return (
                  <tr key={r.name}>
                    <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>{r.name}</td>
                    <td style={tdStyle}><Tag variant={phaseToVariant(r.phase)}>{r.phase}</Tag></td>
                    <td style={tdStyle}>{timeAgo(r.startTimestamp)}</td>
                    <td style={tdStyle}>{duration(r.startTimestamp, r.completionTimestamp)}</td>
                    <td style={tdStyle}>
                      {rInProgress && r.totalItems > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], minWidth: 100 }}>
                          <ProgressBar percent={rPercent} />
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
  );
};

// ============================================================
// Styles
// ============================================================

const rootStyle: React.CSSProperties = { ...panel, overflow: 'hidden', maxWidth: '100%', display: 'flex', flexDirection: 'column' };
const metaSection: React.CSSProperties = { paddingBottom: spacing[4], borderBottom: `1px solid ${colors.gray200}`, marginBottom: spacing[4] };
const metaGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${spacing[1]}px ${spacing[4]}px`, alignItems: 'center' };
const kvRow: React.CSSProperties = { display: 'contents' };
const kvLabel: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: fonts.mono };
const kvValue: React.CSSProperties = { fontSize: fontSize.sm, color: colors.gray800, fontFamily: fonts.mono };
const progressSection: React.CSSProperties = { paddingBottom: spacing[4], borderBottom: `1px solid ${colors.gray200}`, marginBottom: spacing[4] };
const progressLabel: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: spacing[1] };
const progressCount: React.CSSProperties = { fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.gray800, fontWeight: fontWeight.medium };
const sectionTitle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.gray500, marginBottom: spacing[3] };
const tableWrap: React.CSSProperties = { overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', borderSpacing: 0 };
const thStyle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.gray500, padding: `${spacing[2]}px ${spacing[2]}px`, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { fontSize: fontSize.sm, padding: `${spacing[1]}px ${spacing[2]}px`, borderBottom: `1px solid ${colors.gray100}`, fontFamily: fonts.mono, whiteSpace: 'nowrap' };
const alertBoxStyle: React.CSSProperties = { marginBottom: spacing[4], padding: spacing[3], background: colors.redLight, border: `1px solid ${colors.red}`, borderRadius: 4, fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.redText };
