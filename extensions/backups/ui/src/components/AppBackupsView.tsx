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
import { fetchOverview, fetchBackups, fetchRestores, createBackup, createRestore, fetchLogs, toggleSchedulePause, deleteBackup, fetchPodVolumeBackups } from '../api';
import {
  ScheduleSummary,
  BackupSummary,
  RestoreSummary,
  StorageLocationSummary,
  OverviewResponse,
  ResourceRef,
  RestoreOptions,
  PodVolumeBackupSummary,
} from '../types';
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

function formatDate(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
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

function humanTTL(ttl: string): string {
  if (!ttl) return '-';
  const match = ttl.match(/^(\d+)h/);
  if (!match) return ttl;
  const hours = parseInt(match[1], 10);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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

const TTL_OPTIONS = [
  { label: '24 hours', value: '24h0m0s' },
  { label: '3 days', value: '72h0m0s' },
  { label: '7 days', value: '168h0m0s' },
  { label: '30 days', value: '720h0m0s' },
  { label: '90 days', value: '2160h0m0s' },
];

// ============================================================
// Sub-components
// ============================================================

const Sep: React.FC = () => <span style={{ width: 1, height: 16, background: colors.gray200, flexShrink: 0 }} />;

const StatusDot: React.FC<{ ok: boolean }> = ({ ok }) => (
  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 1, background: ok ? colors.greenSolid : colors.redSolid, marginRight: 6, flexShrink: 0 }} />
);

const KV: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: spacing[3], alignItems: 'baseline', marginBottom: 2 }}>
    <span style={{ fontSize: fontSize.xs, color: colors.gray400, fontFamily: fonts.mono, minWidth: 100, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
    <span style={{ fontSize: fontSize.sm, color: colors.gray800, fontFamily: fonts.mono }}>{value}</span>
  </div>
);

const Banner: React.FC<{ variant: 'success' | 'error'; message: string; onDismiss: () => void }> = ({ variant, message, onDismiss }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: `${spacing[2]}px ${spacing[3]}px`, marginBottom: spacing[3],
    background: variant === 'success' ? colors.greenLight : colors.redLight,
    border: `1px solid ${variant === 'success' ? colors.green : colors.red}`,
    borderRadius: 4, fontSize: fontSize.sm, fontFamily: fonts.mono,
    color: variant === 'success' ? colors.greenText : colors.redText,
  }}>
    <span>{message}</span>
    <span onClick={onDismiss} style={{ cursor: 'pointer', fontWeight: fontWeight.semibold, marginLeft: spacing[3] }}>x</span>
  </div>
);

// ============================================================
// Create Backup Panel
// ============================================================

const CreateBackupPanel: React.FC<{
  namespace: string;
  onCancel: () => void;
  onCreate: (ttl: string) => Promise<void>;
}> = ({ namespace, onCancel, onCreate }) => {
  const [ttl, setTtl] = React.useState('72h0m0s');
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    setCreating(true);
    await onCreate(ttl);
    setCreating(false);
  };

  return (
    <div style={panelBox}>
      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray800, marginBottom: spacing[3] }}>Create On-Demand Backup</div>
      <KV label="Namespace" value={<Tag variant="orange">{namespace}</Tag>} />
      <KV label="Type" value="On-demand (not tied to a schedule)" />
      <div style={{ marginTop: spacing[3], marginBottom: spacing[2] }}>
        <span style={{ fontSize: fontSize.xs, color: colors.gray400, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Retention</span>
      </div>
      <div style={{ display: 'flex', gap: spacing[1], flexWrap: 'wrap', marginBottom: spacing[4] }}>
        {TTL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTtl(opt.value)}
            style={{
              padding: `4px ${spacing[3]}px`, border: `1px solid ${ttl === opt.value ? colors.orange500 : colors.gray200}`,
              borderRadius: 4, background: ttl === opt.value ? colors.orange50 : colors.white,
              color: ttl === opt.value ? colors.orange600 : colors.gray600, fontSize: fontSize.sm,
              fontFamily: fonts.mono, cursor: 'pointer', fontWeight: ttl === opt.value ? fontWeight.semibold : fontWeight.normal,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: spacing[2], justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={creating}>Cancel</Button>
        <Button primary onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating...' : 'Create Backup'}
        </Button>
      </div>
    </div>
  );
};

// ============================================================
// Restore Confirmation Panel
// ============================================================

const RESOURCE_POLICY_OPTIONS = [
  { label: 'Skip existing', value: 'none' as const },
  { label: 'Overwrite existing', value: 'update' as const },
];

const COMMON_RESOURCE_TYPES = [
  'deployments', 'statefulsets', 'daemonsets', 'services', 'configmaps',
  'secrets', 'persistentvolumeclaims', 'ingresses', 'jobs', 'cronjobs',
];

const RestoreConfirmPanel: React.FC<{
  backup: BackupSummary;
  namespace: string;
  onCancel: () => void;
  onConfirm: (options: RestoreOptions) => Promise<void>;
}> = ({ backup, namespace, onCancel, onConfirm }) => {
  const [restoring, setRestoring] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [existingPolicy, setExistingPolicy] = React.useState<'none' | 'update'>('none');
  const [includedResources, setIncludedResources] = React.useState('');
  const [excludedResources, setExcludedResources] = React.useState('');
  const [restorePVs, setRestorePVs] = React.useState(false);

  const handleConfirm = async () => {
    setRestoring(true);
    const opts: RestoreOptions = {
      existingResourcePolicy: existingPolicy,
      restorePVs,
    };
    const incl = includedResources.split(',').map(s => s.trim()).filter(Boolean);
    if (incl.length > 0) opts.includedResources = incl;
    const excl = excludedResources.split(',').map(s => s.trim()).filter(Boolean);
    if (excl.length > 0) opts.excludedResources = excl;
    await onConfirm(opts);
    setRestoring(false);
  };

  return (
    <div style={panelBox}>
      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.gray800, marginBottom: spacing[3] }}>Confirm Restore</div>
      <KV label="Backup" value={backup.name} />
      <KV label="Phase" value={<Tag variant={phaseToVariant(backup.phase)}>{backup.phase}</Tag>} />
      <KV label="Created" value={formatDate(backup.startTimestamp)} />
      <KV label="Items" value={`${backup.itemsBackedUp} resources backed up`} />
      <KV label="Namespaces" value={(backup.includedNamespaces || []).join(', ') || 'all'} />
      {backup.scheduleName && <KV label="Schedule" value={backup.scheduleName} />}
      {backup.includedResources && backup.includedResources.length > 0 && (
        <KV label="Backed-up resources" value={backup.includedResources.join(', ')} />
      )}
      {backup.excludedResources && backup.excludedResources.length > 0 && (
        <KV label="Excluded resources" value={backup.excludedResources.join(', ')} />
      )}
      {backup.errors > 0 && <KV label="Errors" value={<span style={{ color: colors.redText }}>{backup.errors} errors during backup</span>} />}
      {backup.warnings > 0 && <KV label="Warnings" value={<span style={{ color: colors.yellowText }}>{backup.warnings} warnings during backup</span>} />}
      {backup.failureReason && (
        <div style={alertBox('red')}>
          <span style={{ fontWeight: fontWeight.semibold }}>Backup failure:</span> {backup.failureReason}
        </div>
      )}

      {/* Backup contents summary */}
      <div style={{ marginTop: spacing[3], padding: spacing[3], border: `1px solid ${colors.gray200}`, borderRadius: 4, background: colors.gray50 }}>
        <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: spacing[2] }}>
          Backup Contents
        </div>
        <div style={{ fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.gray600 }}>
          {backup.itemsBackedUp} resources backed up
          {backup.volumeSnapshotsCompleted !== undefined && backup.volumeSnapshotsCompleted > 0 && (
            <span> + {backup.volumeSnapshotsCompleted} volume snapshot{backup.volumeSnapshotsCompleted !== 1 ? 's' : ''}</span>
          )}
          {(!backup.includedResources || backup.includedResources.length === 0) && (
            <span style={{ color: colors.gray400 }}> (all resource types)</span>
          )}
        </div>
      </div>

      {/* Advanced options toggle */}
      <div
        style={{ marginTop: spacing[3], cursor: 'pointer', fontSize: fontSize.sm, color: colors.orange500, fontFamily: fonts.mono, display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <span style={chevron(showAdvanced)} />
        Advanced options
      </div>

      {showAdvanced && (
        <div style={{ marginTop: spacing[2], padding: spacing[3], border: `1px solid ${colors.gray200}`, borderRadius: 4 }}>
          {/* Existing resource policy */}
          <div style={{ marginBottom: spacing[3] }}>
            <span style={fieldLabel}>Existing resource policy</span>
            <div style={{ display: 'flex', gap: spacing[1], marginTop: spacing[1] }}>
              {RESOURCE_POLICY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExistingPolicy(opt.value)}
                  style={{
                    padding: `4px ${spacing[3]}px`, border: `1px solid ${existingPolicy === opt.value ? colors.orange500 : colors.gray200}`,
                    borderRadius: 4, background: existingPolicy === opt.value ? colors.orange50 : colors.white,
                    color: existingPolicy === opt.value ? colors.orange600 : colors.gray600, fontSize: fontSize.sm,
                    fontFamily: fonts.mono, cursor: 'pointer', fontWeight: existingPolicy === opt.value ? fontWeight.semibold : fontWeight.normal,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include/exclude resources */}
          <div style={{ marginBottom: spacing[3] }}>
            <span style={fieldLabel}>Include resources (comma-separated, e.g. deployments,services)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[1], marginBottom: spacing[1] }}>
              {COMMON_RESOURCE_TYPES.map((rt) => {
                const active = includedResources.split(',').map(s => s.trim()).filter(Boolean).includes(rt);
                return (
                  <button
                    key={rt}
                    onClick={() => {
                      const current = includedResources.split(',').map(s => s.trim()).filter(Boolean);
                      const next = active ? current.filter(c => c !== rt) : [...current, rt];
                      setIncludedResources(next.join(', '));
                    }}
                    style={{
                      padding: `2px ${spacing[2]}px`, border: `1px solid ${active ? colors.orange500 : colors.gray200}`,
                      borderRadius: 4, background: active ? colors.orange50 : colors.white,
                      color: active ? colors.orange600 : colors.gray500, fontSize: fontSize.xs,
                      fontFamily: fonts.mono, cursor: 'pointer',
                    }}
                  >
                    {rt}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={includedResources}
              onChange={(e) => setIncludedResources(e.target.value)}
              placeholder="Leave empty to restore all"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: spacing[3] }}>
            <span style={fieldLabel}>Exclude resources (comma-separated)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[1], marginBottom: spacing[1] }}>
              {COMMON_RESOURCE_TYPES.map((rt) => {
                const active = excludedResources.split(',').map(s => s.trim()).filter(Boolean).includes(rt);
                return (
                  <button
                    key={rt}
                    onClick={() => {
                      const current = excludedResources.split(',').map(s => s.trim()).filter(Boolean);
                      const next = active ? current.filter(c => c !== rt) : [...current, rt];
                      setExcludedResources(next.join(', '));
                    }}
                    style={{
                      padding: `2px ${spacing[2]}px`, border: `1px solid ${active ? colors.orange500 : colors.gray200}`,
                      borderRadius: 4, background: active ? colors.orange50 : colors.white,
                      color: active ? colors.orange600 : colors.gray500, fontSize: fontSize.xs,
                      fontFamily: fonts.mono, cursor: 'pointer',
                    }}
                  >
                    {rt}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={excludedResources}
              onChange={(e) => setExcludedResources(e.target.value)}
              placeholder="e.g. secrets,configmaps"
              style={inputStyle}
            />
          </div>

          {/* Restore PVs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
            <input
              type="checkbox"
              checked={restorePVs}
              onChange={(e) => setRestorePVs(e.target.checked)}
              style={{ accentColor: colors.orange500 }}
            />
            <span style={{ fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.gray600 }}>Restore persistent volumes</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: spacing[3], padding: spacing[3], background: colors.yellowLight, border: `1px solid ${colors.yellow}`, borderRadius: 4, fontSize: fontSize.sm, color: colors.yellowText }}>
        This will restore resources from backup "{backup.name}" into namespace "{namespace}".
        {existingPolicy === 'update' ? ' Existing resources WILL be overwritten.' : ' Existing resources will be skipped.'}
      </div>
      <div style={{ display: 'flex', gap: spacing[2], justifyContent: 'flex-end', marginTop: spacing[3] }}>
        <Button onClick={onCancel} disabled={restoring}>Cancel</Button>
        <Button danger onClick={handleConfirm} disabled={restoring}>
          {restoring ? 'Restoring...' : 'Confirm Restore'}
        </Button>
      </div>
    </div>
  );
};

// ============================================================
// Schedule Detail (expandable row)
// ============================================================

const ScheduleDetail: React.FC<{
  schedule: ScheduleSummary;
  namespace: string;
  appNamespace: string;
  appName: string;
  project: string;
  onTrigger: (scheduleName: string, ttl?: string) => void;
  onPauseToggled: () => void;
}> = ({ schedule: s, namespace, appNamespace, appName, project, onTrigger, onPauseToggled }) => {
  const [toggling, setToggling] = React.useState(false);

  const handleTogglePause = async () => {
    setToggling(true);
    try {
      await toggleSchedulePause(s.name, !s.paused, appNamespace, appName, project);
      onPauseToggled();
    } catch { /* banner will be shown by parent */ }
    setToggling(false);
  };

  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${colors.gray200}` }}>
        <div style={{ padding: `${spacing[3]}px ${spacing[4]}px`, background: colors.gray50 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing[1]}px ${spacing[6]}px`, maxWidth: 600 }}>
            <KV label="Schedule" value={s.name} />
            <KV label="Namespace" value={s.namespace} />
            <KV label="Cron" value={s.cron} />
            <KV label="TTL" value={s.ttl ? humanTTL(s.ttl) : '-'} />
            <KV label="Created" value={formatDate(s.creationTimestamp)} />
            <KV label="Status" value={s.paused ? <Tag variant="orange">Paused</Tag> : <Tag variant="green">Active</Tag>} />
            {s.includedNamespaces && s.includedNamespaces.length > 0 && (
              <KV label="Includes" value={s.includedNamespaces.join(', ')} />
            )}
            {(!s.includedNamespaces || s.includedNamespaces.length === 0) && (
              <KV label="Includes" value={<span style={{ color: colors.gray400 }}>all namespaces</span>} />
            )}
            {s.excludedNamespaces && s.excludedNamespaces.length > 0 && (
              <KV label="Excludes" value={s.excludedNamespaces.join(', ')} />
            )}
          </div>
          <div style={{ marginTop: spacing[3], display: 'flex', gap: spacing[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <Button primary onClick={() => onTrigger(s.name, s.ttl)} disabled={s.paused || s.ownership === 'platform'}>
              Trigger Backup
            </Button>
            {s.ownership !== 'platform' && (
              <Button onClick={handleTogglePause} disabled={toggling}>
                {toggling ? 'Updating...' : s.paused ? 'Resume Schedule' : 'Pause Schedule'}
              </Button>
            )}
            {s.paused && <span style={{ fontSize: fontSize.sm, color: colors.gray400 }}>Schedule is paused</span>}
            {s.ownership === 'platform' && !s.paused && <span style={{ fontSize: fontSize.sm, color: colors.gray400 }}>Cannot trigger platform schedules (may affect other namespaces)</span>}
          </div>
        </div>
      </td>
    </tr>
  );
};

// ============================================================
// Backup Detail (expandable row)
// ============================================================

const BackupDetail: React.FC<{ backup: BackupSummary; appNamespace: string; appName: string; project: string; onDeleted: () => void }> = ({ backup: b, appNamespace, appName, project, onDeleted }) => {
  const [logsLoading, setLogsLoading] = React.useState(false);
  const [logsError, setLogsError] = React.useState<string | null>(null);
  const [logsContent, setLogsContent] = React.useState<{ title: string; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [pvbs, setPvbs] = React.useState<PodVolumeBackupSummary[]>([]);
  const [pvbsLoaded, setPvbsLoaded] = React.useState(false);

  React.useEffect(() => {
    fetchPodVolumeBackups(b.name, appNamespace, appName, project)
      .then(setPvbs)
      .catch(() => setPvbs([]))
      .finally(() => setPvbsLoaded(true));
  }, [b.name, appNamespace, appName, project]);

  const openLogs = async (kind: 'BackupLog' | 'BackupResults') => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const result = await fetchLogs(b.name, kind, appNamespace, appName, project);
      setLogsContent({ title: kind === 'BackupLog' ? 'Backup Logs' : 'Backup Results', text: result.content });
    } catch (err: any) {
      setLogsError(`Could not fetch ${kind === 'BackupLog' ? 'logs' : 'results'}: ${err.message || 'unknown error'}. Velero DownloadRequest CRD may not be installed.`);
    }
    setLogsLoading(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteBackup(b.name, appNamespace, appName, project);
      onDeleted();
    } catch { /* parent handles */ }
    setDeleting(false);
    setConfirmDelete(false);
  };

  return (
    <tr>
      <td colSpan={8} style={{ padding: 0, borderBottom: `1px solid ${colors.gray200}` }}>
        <div style={{ padding: `${spacing[3]}px ${spacing[4]}px`, background: colors.gray50 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing[1]}px ${spacing[6]}px`, maxWidth: 600 }}>
            <KV label="Backup" value={b.name} />
            <KV label="Phase" value={<Tag variant={phaseToVariant(b.phase)}>{b.phase}</Tag>} />
            <KV label="Started" value={formatDate(b.startTimestamp)} />
            <KV label="Completed" value={formatDate(b.completionTimestamp)} />
            <KV label="Duration" value={duration(b.startTimestamp, b.completionTimestamp)} />
            <KV label="Items" value={`${b.itemsBackedUp} / ${b.totalItems}`} />
            {b.scheduleName && <KV label="Schedule" value={b.scheduleName} />}
            <KV label="Namespaces" value={(b.includedNamespaces || []).join(', ') || 'all'} />
            {b.includedResources && b.includedResources.length > 0 && <KV label="Resources" value={b.includedResources.join(', ')} />}
            {b.excludedResources && b.excludedResources.length > 0 && <KV label="Excluded" value={b.excludedResources.join(', ')} />}
            {b.expiresAt && <KV label="Expires" value={formatDate(b.expiresAt)} />}
            <KV label="Snapshots" value={`${b.volumeSnapshotsCompleted} / ${b.volumeSnapshotsAttempted}`} />
            {b.errors > 0 && <KV label="Errors" value={<span style={{ color: colors.redText }}>{b.errors}</span>} />}
            {b.warnings > 0 && <KV label="Warnings" value={<span style={{ color: colors.yellowText }}>{b.warnings}</span>} />}
          </div>

          {/* PodVolumeBackups */}
          {pvbsLoaded && pvbs.length > 0 && (
            <div style={{ marginTop: spacing[3] }}>
              <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.gray500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: spacing[2] }}>
                File-System Backups ({pvbs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[1] }}>
                {pvbs.map((pvb) => (
                  <div key={pvb.name} style={{ display: 'flex', alignItems: 'center', gap: spacing[3], fontSize: fontSize.sm, fontFamily: fonts.mono, padding: `${spacing[1]}px 0` }}>
                    <Tag variant={phaseToVariant(pvb.phase)}>{pvb.phase}</Tag>
                    <span style={{ color: colors.gray600 }}>{pvb.podNamespace}/{pvb.podName}</span>
                    <span style={{ color: colors.gray400 }}>vol: {pvb.volume}</span>
                    {pvb.uploaderType && <span style={{ color: colors.gray400 }}>({pvb.uploaderType})</span>}
                    {pvb.totalBytes > 0 && (
                      <span style={{ color: colors.gray500 }}>{formatBytes(pvb.bytesDone)}/{formatBytes(pvb.totalBytes)}</span>
                    )}
                    {pvb.message && <span style={{ color: colors.redText, fontSize: fontSize.xs }}>{pvb.message}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {b.failureReason && (
            <div style={alertBox('red')}>
              <span style={{ fontWeight: fontWeight.semibold }}>Failure:</span> {b.failureReason}
            </div>
          )}
          {b.validationErrors && b.validationErrors.length > 0 && (
            <div style={alertBox('red')}>
              <span style={{ fontWeight: fontWeight.semibold }}>Validation errors:</span>
              <ul style={{ margin: `${spacing[1]}px 0 0 ${spacing[4]}px`, padding: 0 }}>
                {b.validationErrors.map((e, i) => <li key={i} style={{ fontSize: fontSize.sm }}>{e}</li>)}
              </ul>
            </div>
          )}
          {(b.phase === 'Completed' || b.phase === 'PartiallyFailed' || b.phase === 'Failed') && (
            <div style={{ display: 'flex', gap: spacing[2], marginTop: spacing[3], flexWrap: 'wrap' }}>
              <Button onClick={() => openLogs('BackupLog')} disabled={logsLoading}>
                {logsLoading ? 'Loading...' : 'View Logs'}
              </Button>
              {(b.errors > 0 || b.warnings > 0) && (
                <Button onClick={() => openLogs('BackupResults')} disabled={logsLoading}>
                  View Results
                </Button>
              )}
              {!confirmDelete ? (
                <Button danger onClick={() => setConfirmDelete(true)}>Delete Backup</Button>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
                  <span style={{ fontSize: fontSize.sm, color: colors.redText }}>Delete "{b.name}"?</span>
                  <Button danger onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Confirm'}</Button>
                  <Button onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
                </span>
              )}
            </div>
          )}
          {logsError && (
            <div style={alertBox('yellow')}>
              {logsError}
            </div>
          )}
          {logsContent && (
            <LogViewer title={logsContent.title} content={logsContent.text} onClose={() => setLogsContent(null)} />
          )}
        </div>
      </td>
    </tr>
  );
};

// ============================================================
// Restore Detail (expandable row)
// ============================================================

const RestoreDetail: React.FC<{ restore: RestoreSummary; appNamespace: string; appName: string; project: string }> = ({ restore: r, appNamespace, appName, project }) => {
  const [logsLoading, setLogsLoading] = React.useState(false);
  const [logsError, setLogsError] = React.useState<string | null>(null);
  const [logsContent, setLogsContent] = React.useState<{ title: string; text: string } | null>(null);

  const openLogs = async (kind: 'RestoreLog' | 'RestoreResults') => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const result = await fetchLogs(r.name, kind, appNamespace, appName, project);
      setLogsContent({ title: kind === 'RestoreLog' ? 'Restore Logs' : 'Restore Results', text: result.content });
    } catch (err: any) {
      setLogsError(`Could not fetch ${kind === 'RestoreLog' ? 'logs' : 'results'}: ${err.message || 'unknown error'}. Velero DownloadRequest CRD may not be installed.`);
    }
    setLogsLoading(false);
  };

  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${colors.gray200}` }}>
        <div style={{ padding: `${spacing[3]}px ${spacing[4]}px`, background: colors.gray50 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing[1]}px ${spacing[6]}px`, maxWidth: 600 }}>
            <KV label="Restore" value={r.name} />
            <KV label="Phase" value={<Tag variant={phaseToVariant(r.phase)}>{r.phase}</Tag>} />
            <KV label="Backup" value={r.backupName} />
            <KV label="Started" value={formatDate(r.startTimestamp)} />
            <KV label="Completed" value={formatDate(r.completionTimestamp)} />
            <KV label="Duration" value={duration(r.startTimestamp, r.completionTimestamp)} />
            <KV label="Items" value={`${r.itemsRestored} / ${r.totalItems}`} />
            {r.includedResources && r.includedResources.length > 0 && <KV label="Resources" value={r.includedResources.join(', ')} />}
            {r.excludedResources && r.excludedResources.length > 0 && <KV label="Excluded" value={r.excludedResources.join(', ')} />}
            {r.existingResourcePolicy && <KV label="Policy" value={r.existingResourcePolicy === 'update' ? 'Overwrite existing' : 'Skip existing'} />}
            {r.namespaceMapping && Object.keys(r.namespaceMapping).length > 0 && (
              <KV label="NS Mapping" value={Object.entries(r.namespaceMapping).map(([k, v]) => `${k} → ${v}`).join(', ')} />
            )}
            {r.errors > 0 && <KV label="Errors" value={<span style={{ color: colors.redText }}>{r.errors}</span>} />}
            {r.warnings > 0 && <KV label="Warnings" value={<span style={{ color: colors.yellowText }}>{r.warnings}</span>} />}
          </div>
          {r.failureReason && (
            <div style={alertBox('red')}>
              <span style={{ fontWeight: fontWeight.semibold }}>Failure:</span> {r.failureReason}
            </div>
          )}
          {r.validationErrors && r.validationErrors.length > 0 && (
            <div style={alertBox('red')}>
              <span style={{ fontWeight: fontWeight.semibold }}>Validation errors:</span>
              <ul style={{ margin: `${spacing[1]}px 0 0 ${spacing[4]}px`, padding: 0 }}>
                {r.validationErrors.map((e, i) => <li key={i} style={{ fontSize: fontSize.sm }}>{e}</li>)}
              </ul>
            </div>
          )}
          {(r.phase === 'Completed' || r.phase === 'PartiallyFailed' || r.phase === 'Failed') && (
            <div style={{ display: 'flex', gap: spacing[2], marginTop: spacing[3] }}>
              <Button onClick={() => openLogs('RestoreLog')} disabled={logsLoading}>
                {logsLoading ? 'Loading...' : 'View Logs'}
              </Button>
              {(r.errors > 0 || r.warnings > 0) && (
                <Button onClick={() => openLogs('RestoreResults')} disabled={logsLoading}>
                  View Results
                </Button>
              )}
            </div>
          )}
          {logsError && (
            <div style={alertBox('yellow')}>
              {logsError}
            </div>
          )}
          {logsContent && (
            <LogViewer title={logsContent.title} content={logsContent.text} onClose={() => setLogsContent(null)} />
          )}
        </div>
      </td>
    </tr>
  );
};

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

  // UI state
  const [showCreatePanel, setShowCreatePanel] = React.useState(false);
  const [restoreTarget, setRestoreTarget] = React.useState<BackupSummary | null>(null);
  const [expandedSchedule, setExpandedSchedule] = React.useState<string | null>(null);
  const [expandedBackup, setExpandedBackup] = React.useState<string | null>(null);
  const [expandedRestore, setExpandedRestore] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState<{ variant: 'success' | 'error'; message: string } | null>(null);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    // Include all resources in the tree (not just destination namespace).
    // Schedules may live in the velero namespace but still be app-owned.
    return tree.nodes
      .map((n: any) => ({ group: n.group || '', kind: n.kind, namespace: n.namespace || '', name: n.name }));
  }, [tree]);

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

  const refreshInterval = React.useMemo(
    () => hasInProgress(allBackups, allRestores) ? REFRESH_FAST : REFRESH_NORMAL,
    [allBackups, allRestores]
  );
  React.useEffect(() => { const i = setInterval(fetchAll, refreshInterval); return () => clearInterval(i); }, [fetchAll, refreshInterval]);

  // Auto-dismiss banner after 6s
  React.useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const schedules = overview?.schedules || [];
  const storageLocations = overview?.storageLocations || [];
  const bsl = React.useMemo(() => bslStatus(storageLocations), [storageLocations]);
  const platformScheduleNames = React.useMemo(() => new Set(schedules.filter(s => s.ownership === 'platform').map(s => s.name)), [schedules]);

  const handleCreateBackup = React.useCallback(async (ttl: string) => {
    try {
      const result = await createBackup(namespace, appNamespace, appName, project, ttl);
      setShowCreatePanel(false);
      setBanner({ variant: 'success', message: `Backup "${result.name}" created. It will appear in the Backups tab shortly.` });
      setActiveTab('backups');
      setTimeout(fetchAll, 2000);
    } catch (err: any) {
      setBanner({ variant: 'error', message: `Failed to create backup: ${err.message || 'unknown error'}` });
    }
  }, [namespace, appNamespace, appName, project, fetchAll]);

  const handleRestore = React.useCallback(async (options: RestoreOptions) => {
    if (!restoreTarget) return;
    try {
      const result = await createRestore(restoreTarget.name, namespace, appNamespace, appName, project, options);
      setRestoreTarget(null);
      setBanner({ variant: 'success', message: `Restore "${result.name}" started from backup "${restoreTarget.name}". It will appear in the Restores tab.` });
      setActiveTab('restores');
      setTimeout(fetchAll, 2000);
    } catch (err: any) {
      setBanner({ variant: 'error', message: `Failed to create restore: ${err.message || 'unknown error'}` });
    }
  }, [restoreTarget, namespace, appNamespace, appName, project, fetchAll]);

  const handleTriggerFromSchedule = React.useCallback(async (scheduleName: string, ttl?: string) => {
    try {
      const result = await createBackup(namespace, appNamespace, appName, project, ttl || undefined, scheduleName);
      setBanner({ variant: 'success', message: `Backup "${result.name}" triggered from schedule "${scheduleName}".` });
      setActiveTab('backups');
      setTimeout(fetchAll, 2000);
    } catch (err: any) {
      setBanner({ variant: 'error', message: `Failed to trigger backup: ${err.message || 'unknown error'}` });
    }
  }, [namespace, appNamespace, appName, project, fetchAll]);

  if (loading) return <div style={panel}><Loading /></div>;
  if (error && !overview) return (
    <div style={panel}>
      <div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div>
      <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
    </div>
  );

  return (
    <div style={rootStyle}>
      {/* Banner */}
      {banner && <Banner variant={banner.variant} message={banner.message} onDismiss={() => setBanner(null)} />}

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
          {!showCreatePanel && !restoreTarget && (
            <Button primary onClick={() => setShowCreatePanel(true)}>Create Backup</Button>
          )}
        </div>
      </div>

      {/* BSL details */}
      {storageLocations.length > 0 && (
        <div style={{ display: 'flex', gap: spacing[4], flexWrap: 'wrap', paddingTop: spacing[2], paddingBottom: spacing[2], borderBottom: `1px solid ${colors.gray100}` }}>
          {storageLocations.map((loc) => (
            <div key={loc.name} style={{ display: 'flex', alignItems: 'center', gap: spacing[2], fontSize: fontSize.sm, fontFamily: fonts.mono }}>
              <StatusDot ok={loc.phase === 'Available'} />
              <span style={{ color: colors.gray800 }}>{loc.name}</span>
              <span style={{ color: colors.gray400 }}>{loc.provider}{loc.bucket ? ` / ${loc.bucket}` : ''}</span>
              <Tag variant={loc.phase === 'Available' ? 'green' : 'red'}>{loc.phase}</Tag>
              {loc.lastValidationTime && <span style={{ color: colors.gray400, fontSize: fontSize.xs }}>validated {timeAgo(loc.lastValidationTime)}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Create Backup Panel */}
      {showCreatePanel && (
        <CreateBackupPanel
          namespace={namespace}
          onCancel={() => setShowCreatePanel(false)}
          onCreate={handleCreateBackup}
        />
      )}

      {/* Restore Confirmation Panel */}
      {restoreTarget && (
        <RestoreConfirmPanel
          backup={restoreTarget}
          namespace={namespace}
          onCancel={() => setRestoreTarget(null)}
          onConfirm={handleRestore}
        />
      )}

      {/* Tabs */}
      <div style={tabBar}>
        <button style={tab(activeTab === 'schedules')} onClick={() => setActiveTab('schedules')}>
          Schedules ({schedules.length})
        </button>
        <button style={tab(activeTab === 'backups')} onClick={() => setActiveTab('backups')}>
          Backups ({allBackups.length})
        </button>
        <button style={tab(activeTab === 'restores')} onClick={() => setActiveTab('restores')}>
          Restores ({allRestores.length})
        </button>
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
                    <React.Fragment key={s.name}>
                      <tr
                        style={{ cursor: 'pointer', background: expandedSchedule === s.name ? colors.gray50 : undefined }}
                        onClick={() => setExpandedSchedule(expandedSchedule === s.name ? null : s.name)}
                      >
                        <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={chevron(expandedSchedule === s.name)} />
                            {s.name}
                          </span>
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
                            <span style={{ color: colors.gray400 }}>never</span>
                          )}
                        </td>
                        <td style={tdStyle}>{s.ttl ? humanTTL(s.ttl) : '-'}</td>
                        <td style={tdStyle}>
                          <Tag variant={s.ownership === 'app' ? 'green' : 'gray'}>
                            {s.ownership === 'app' ? 'App' : 'Platform'}
                          </Tag>
                        </td>
                        <td style={tdStyle}>{s.backupCount}</td>
                      </tr>
                      {expandedSchedule === s.name && <ScheduleDetail schedule={s} namespace={namespace} appNamespace={appNamespace} appName={appName} project={project} onTrigger={handleTriggerFromSchedule} onPauseToggled={() => setTimeout(fetchAll, 1000)} />}
                    </React.Fragment>
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
                  <th style={thStyle}>Issues</th>
                  <th style={thStyle}>Actions</th>
                </tr></thead>
                <tbody>
                  {allBackups.map((b) => {
                    const inProgress = b.phase === 'InProgress' || b.phase === 'New';
                    const itemPercent = b.totalItems > 0 ? Math.round((b.itemsBackedUp / b.totalItems) * 100) : 0;
                    const isExpanded = expandedBackup === b.name;
                    return (
                      <React.Fragment key={b.name}>
                        <tr
                          style={{ cursor: 'pointer', background: isExpanded ? colors.gray50 : undefined }}
                          onClick={() => setExpandedBackup(isExpanded ? null : b.name)}
                        >
                          <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={chevron(isExpanded)} />
                              {b.name}
                            </span>
                          </td>
                          <td style={tdStyle}><Tag variant={phaseToVariant(b.phase)}>{b.phase}</Tag></td>
                          <td style={tdStyle}>{b.scheduleName || <span style={{ color: colors.gray400 }}>on-demand</span>}</td>
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
                          <td style={tdStyle}>
                            {b.errors > 0 && <Tag variant="red">{b.errors} err</Tag>}
                            {b.warnings > 0 && <Tag variant="gray">{b.warnings} warn</Tag>}
                            {b.errors === 0 && b.warnings === 0 && <span style={{ color: colors.gray400 }}>-</span>}
                          </td>
                          <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                            {b.phase === 'Completed' && !platformScheduleNames.has(b.scheduleName || '') && (
                              <Button onClick={() => setRestoreTarget(b)}>Restore</Button>
                            )}
                            {b.phase === 'Completed' && b.scheduleName && platformScheduleNames.has(b.scheduleName) && (
                              <span style={{ fontSize: fontSize.xs, color: colors.gray400 }}>Platform backup</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && <BackupDetail backup={b} appNamespace={appNamespace} appName={appName} project={project} onDeleted={() => { setBanner({ variant: 'success', message: `Delete request created for backup "${b.name}".` }); setTimeout(fetchAll, 2000); }} />}
                      </React.Fragment>
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
            <EmptyState message="No restores found for this namespace" />
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
                  <th style={thStyle}>Issues</th>
                </tr></thead>
                <tbody>
                  {allRestores.map((r) => {
                    const inProgress = r.phase === 'InProgress' || r.phase === 'New';
                    const itemPercent = r.totalItems > 0 ? Math.round((r.itemsRestored / r.totalItems) * 100) : 0;
                    const isExpanded = expandedRestore === r.name;
                    return (
                      <React.Fragment key={r.name}>
                        <tr
                          style={{ cursor: 'pointer', background: isExpanded ? colors.gray50 : undefined }}
                          onClick={() => setExpandedRestore(isExpanded ? null : r.name)}
                        >
                          <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={chevron(isExpanded)} />
                              {r.name}
                            </span>
                          </td>
                          <td style={tdStyle}><Tag variant={phaseToVariant(r.phase)}>{r.phase}</Tag></td>
                          <td style={tdStyle}>{r.backupName}</td>
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
                          <td style={tdStyle}>
                            {r.errors > 0 && <Tag variant="red">{r.errors} err</Tag>}
                            {r.warnings > 0 && <Tag variant="gray">{r.warnings} warn</Tag>}
                            {r.errors === 0 && r.warnings === 0 && <span style={{ color: colors.gray400 }}>-</span>}
                          </td>
                        </tr>
                        {isExpanded && <RestoreDetail restore={r} appNamespace={appNamespace} appName={appName} project={project} />}
                      </React.Fragment>
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
// Styles
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
const panelBox: React.CSSProperties = { margin: `${spacing[3]}px 0`, padding: spacing[4], border: `1px solid ${colors.gray200}`, borderRadius: 4, background: colors.white };
const chevron = (expanded: boolean): React.CSSProperties => ({
  display: 'inline-block', width: 0, height: 0, flexShrink: 0,
  borderLeft: expanded ? '4px solid transparent' : `5px solid ${colors.gray400}`,
  borderRight: expanded ? '4px solid transparent' : 'none',
  borderTop: expanded ? `5px solid ${colors.gray400}` : '4px solid transparent',
  borderBottom: expanded ? 'none' : '4px solid transparent',
  marginRight: 2,
});
const alertBox = (color: 'red' | 'yellow'): React.CSSProperties => ({
  marginTop: spacing[3], padding: spacing[3],
  background: color === 'red' ? colors.redLight : colors.yellowLight,
  border: `1px solid ${color === 'red' ? colors.red : colors.yellow}`,
  borderRadius: 4, fontSize: fontSize.sm, fontFamily: fonts.mono,
  color: color === 'red' ? colors.redText : colors.yellowText,
});
const fieldLabel: React.CSSProperties = { fontSize: fontSize.xs, color: colors.gray500, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 2 };
const inputStyle: React.CSSProperties = { width: '100%', padding: `${spacing[1]}px ${spacing[2]}px`, border: `1px solid ${colors.gray200}`, borderRadius: 4, fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.gray800, marginTop: 2, boxSizing: 'border-box' };
