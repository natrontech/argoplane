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
import { fetchBackups, createBackup } from '../api';
import { BackupSummary } from '../types';

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

const REFRESH_INTERVAL = 10_000;

export const ScheduleBackupsTab: React.FC<{ resource: any; tree?: any; application: any }> = ({ resource, tree, application }) => {
  const [backups, setBackups] = React.useState<BackupSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [triggering, setTriggering] = React.useState(false);
  const [triggerError, setTriggerError] = React.useState<string | null>(null);

  const scheduleName = resource?.metadata?.name || '';
  const cron = resource?.spec?.schedule || '-';
  const ttl = resource?.spec?.template?.ttl || resource?.spec?.ttl || '-';
  const paused = resource?.spec?.paused || false;
  const includedNs = resource?.spec?.template?.includedNamespaces || resource?.spec?.includedNamespaces || [];
  const excludedNs = resource?.spec?.template?.excludedNamespaces || resource?.spec?.excludedNamespaces || [];

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  // Use the first included namespace or the app's destination namespace as the target.
  const targetNamespace = includedNs.length > 0 ? includedNs[0] : application?.spec?.destination?.namespace || '';

  const loadBackups = React.useCallback(() => {
    if (!targetNamespace) return;
    // Fetch backups filtered by target namespace AND this schedule name.
    fetchBackups(targetNamespace, appNamespace, appName, project, scheduleName)
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setLoading(false));
  }, [targetNamespace, appNamespace, appName, project, scheduleName]);

  React.useEffect(() => { setLoading(true); loadBackups(); }, [loadBackups]);
  React.useEffect(() => { const i = setInterval(loadBackups, REFRESH_INTERVAL); return () => clearInterval(i); }, [loadBackups]);

  const handleTriggerBackup = React.useCallback(async () => {
    setTriggering(true);
    setTriggerError(null);
    try {
      await createBackup(targetNamespace, appNamespace, appName, project, ttl !== '-' ? ttl : undefined);
      setTimeout(loadBackups, 2000);
    } catch (err: any) {
      setTriggerError(`Failed to trigger backup: ${err.message || 'unknown error'}`);
    } finally {
      setTriggering(false);
    }
  }, [targetNamespace, appNamespace, appName, project, ttl, loadBackups]);

  return (
    <div style={rootStyle}>
      {/* Schedule metadata */}
      <div style={metaSection}>
        <div style={metaGrid}>
          <KV label="Schedule" value={scheduleName} />
          <KV label="Cron" value={cron} />
          <KV label="TTL" value={ttl} />
          <KV label="Paused" value={paused ? <Tag variant="orange">Yes</Tag> : <span style={{ color: colors.gray400 }}>No</span>} />
          {includedNs.length > 0 && <KV label="Included Namespaces" value={includedNs.join(', ')} />}
          {includedNs.length === 0 && <KV label="Included Namespaces" value={<span style={{ color: colors.gray400 }}>all namespaces</span>} />}
          {excludedNs.length > 0 && <KV label="Excluded Namespaces" value={excludedNs.join(', ')} />}
        </div>
        <div style={{ marginTop: spacing[3] }}>
          <Button primary onClick={handleTriggerBackup} disabled={triggering || paused}>
            {triggering ? 'Triggering...' : 'Trigger Backup'}
          </Button>
          {paused && <span style={{ marginLeft: spacing[2], fontSize: fontSize.sm, color: colors.gray400 }}>Schedule is paused</span>}
        </div>
        {triggerError && (
          <div style={{ marginTop: spacing[2], padding: spacing[3], background: colors.redLight, border: `1px solid ${colors.red}`, borderRadius: 4, fontSize: fontSize.sm, fontFamily: fonts.mono, color: colors.redText }}>
            {triggerError}
          </div>
        )}
      </div>

      {/* Backups from this schedule */}
      <div style={sectionTitle}>BACKUPS FROM THIS SCHEDULE</div>

      {loading ? (
        <Loading />
      ) : backups.length === 0 ? (
        <EmptyState message="No backups found for this schedule" />
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
              {backups.map((b) => {
                const inProgress = b.phase === 'InProgress' || b.phase === 'New';
                const itemPercent = b.totalItems > 0 ? Math.round((b.itemsBackedUp / b.totalItems) * 100) : 0;
                return (
                  <tr key={b.name}>
                    <td style={{ ...tdStyle, fontWeight: fontWeight.semibold }}>{b.name}</td>
                    <td style={tdStyle}><Tag variant={phaseToVariant(b.phase)}>{b.phase}</Tag></td>
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
const sectionTitle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.gray500, marginBottom: spacing[3] };
const tableWrap: React.CSSProperties = { overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', borderSpacing: 0 };
const thStyle: React.CSSProperties = { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.gray500, padding: `${spacing[2]}px ${spacing[2]}px`, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { fontSize: fontSize.sm, padding: `${spacing[1]}px ${spacing[2]}px`, borderBottom: `1px solid ${colors.gray100}`, fontFamily: fonts.mono, whiteSpace: 'nowrap' };
