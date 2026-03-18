import * as React from 'react';
import {
  Loading,
  EmptyState,
  Button,
  SectionHeader,
  MetricCard,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchReports, triggerRescan } from '../api';
import { ImageReport, Vulnerability } from '../types';

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

const severityColor: Record<string, string> = {
  CRITICAL: colors.redText,
  HIGH: colors.orange500,
  MEDIUM: colors.yellowText,
  LOW: colors.blueText,
  UNKNOWN: colors.gray500,
};

const severityBg: Record<string, string> = {
  CRITICAL: colors.redLight,
  HIGH: colors.orange100,
  MEDIUM: colors.yellowLight,
  LOW: colors.blueLight,
  UNKNOWN: colors.gray100,
};

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 6px',
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      fontFamily: fonts.mono,
      color: severityColor[severity] || colors.gray600,
      background: severityBg[severity] || colors.gray100,
      borderRadius: 2,
      textTransform: 'uppercase',
    }}
  >
    {severity}
  </span>
);

// ============================================================
// Severity Filter
// ============================================================

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const;

const SeverityFilter: React.FC<{
  selected: Set<string>;
  onToggle: (sev: string) => void;
}> = ({ selected, onToggle }) => (
  <div style={{ display: 'flex', gap: spacing[2], marginBottom: spacing[4] }}>
    {SEVERITIES.map(sev => (
      <button
        key={sev}
        onClick={() => onToggle(sev)}
        style={{
          padding: '2px 8px',
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
          fontFamily: fonts.mono,
          border: `1px solid ${selected.has(sev) ? (severityColor[sev] || colors.gray400) : colors.gray200}`,
          borderRadius: 2,
          background: selected.has(sev) ? (severityBg[sev] || colors.gray100) : 'transparent',
          color: selected.has(sev) ? (severityColor[sev] || colors.gray600) : colors.gray500,
          cursor: 'pointer',
        }}
      >
        {sev}
      </button>
    ))}
  </div>
);

// ============================================================
// Main Component
// ============================================================

export const PodVulnerabilitiesTab: React.FC<{ resource: any; application: any }> = ({ resource, application }) => {
  const [reports, setReports] = React.useState<ImageReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rescanning, setRescanning] = React.useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = React.useState<Set<string>>(new Set(SEVERITIES));

  const podNamespace = resource?.metadata?.namespace || 'default';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // Trivy reports are keyed by the pod's owner (ReplicaSet, DaemonSet, etc), not the pod itself.
  const ownerRef = resource?.metadata?.ownerReferences?.[0];
  const ownerName = ownerRef?.name || '';
  const ownerKind = ownerRef?.kind || '';

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // If we know the owner, filter by it. Otherwise fetch all reports in the namespace.
    const resourceFilter = ownerName || undefined;
    const kindFilter = ownerKind || undefined;

    fetchReports(podNamespace, appNamespace, appName, project, resourceFilter, kindFilter)
      .then(data => { if (!cancelled) setReports(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [podNamespace, appNamespace, appName, project, ownerName, ownerKind]);

  const handleRescan = (report: ImageReport) => {
    setRescanning(report.reportName);
    triggerRescan(podNamespace, report.reportName, appNamespace, appName, project)
      .catch(err => setError(err.message))
      .finally(() => setRescanning(null));
  };

  const toggleSeverity = (sev: string) => {
    setSeverityFilter(prev => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><EmptyState message={`Failed to load: ${error}`} /></div>;
  if (reports.length === 0) {
    return <div style={panel}><EmptyState message="No vulnerability reports found for this pod." /></div>;
  }

  return (
    <div style={panel}>
      {reports.map(report => {
        const vulns = (report.vulnerabilities || []).filter(v => severityFilter.has(v.severity));
        const total = report.summary.critical + report.summary.high + report.summary.medium + report.summary.low + report.summary.unknown;

        return (
          <div key={report.reportName} style={{ marginBottom: spacing[6] }}>
            <SectionHeader
              title={`${report.containerName || 'container'} - ${report.image}:${report.tag || 'latest'}`}
              action={
                <Button onClick={() => handleRescan(report)} disabled={rescanning === report.reportName}>
                  {rescanning === report.reportName ? 'Scanning...' : 'Rescan'}
                </Button>
              }
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: spacing[3], marginBottom: spacing[4] }}>
              <MetricCard label="Critical" value={String(report.summary.critical)} />
              <MetricCard label="High" value={String(report.summary.high)} />
              <MetricCard label="Medium" value={String(report.summary.medium)} />
              <MetricCard label="Low" value={String(report.summary.low)} />
              <MetricCard label="Fixable" value={String(report.fixable)} />
              <MetricCard label="Total" value={String(total)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <SeverityFilter selected={severityFilter} onToggle={toggleSeverity} />
              <span style={{ fontSize: fontSize.xs, color: colors.gray500 }}>
                Scanned {timeAgo(report.lastScanned)}
              </span>
            </div>

            {vulns.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['CVE', 'Severity', 'Score', 'Package', 'Installed', 'Fixed'].map(h => (
                      <th key={h} style={{
                        padding: `${spacing[2]}px ${spacing[3]}px`,
                        fontSize: fontSize.xs,
                        fontWeight: fontWeight.semibold,
                        textTransform: 'uppercase' as const,
                        color: colors.gray500,
                        borderBottom: `2px solid ${colors.gray200}`,
                        textAlign: 'left' as const,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vulns.map((v, i) => (
                    <tr key={`${v.id}-${i}`}>
                      <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                        {v.primaryLink ? (
                          <a href={v.primaryLink} target="_blank" rel="noopener noreferrer" style={{ color: colors.blueText, textDecoration: 'none' }}>
                            {v.id}
                          </a>
                        ) : v.id}
                      </td>
                      <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, borderBottom: `1px solid ${colors.gray100}` }}>
                        <SeverityBadge severity={v.severity} />
                      </td>
                      <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                        {v.score > 0 ? v.score.toFixed(1) : '-'}
                      </td>
                      <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                        {v.package}
                      </td>
                      <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                        {v.installedVersion}
                      </td>
                      <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}`, color: v.fixedVersion ? colors.greenText : colors.gray400 }}>
                        {v.fixedVersion || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: colors.gray500, fontSize: fontSize.sm, padding: spacing[4] }}>
                No vulnerabilities match the current filter.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
