import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  Button,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchReports, triggerRescan } from '../api';
import { ImageReport } from '../types';

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
// Main Component
// ============================================================

export const DeploymentVulnerabilitiesTab: React.FC<{ resource: any; application: any; tree?: any }> = ({ resource, application, tree }) => {
  const [reports, setReports] = React.useState<ImageReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rescanning, setRescanning] = React.useState<string | null>(null);

  const namespace = resource?.metadata?.namespace || 'default';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReports(namespace, appNamespace, appName, project)
      .then(data => { if (!cancelled) setReports(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [namespace, appNamespace, appName, project]);

  const handleRescan = (report: ImageReport) => {
    setRescanning(report.reportName);
    triggerRescan(namespace, report.reportName, appNamespace, appName, project)
      .catch(err => setError(err.message))
      .finally(() => setRescanning(null));
  };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><EmptyState message={`Failed to load: ${error}`} /></div>;
  if (reports.length === 0) {
    return <div style={panel}><EmptyState message="No vulnerability reports found for this deployment's pods." /></div>;
  }

  // Deduplicate by image.
  const seen = new Set<string>();
  const uniqueReports = reports.filter(r => {
    const key = `${r.image}:${r.tag}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Aggregate summary.
  const totalSummary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  let totalFixable = 0;
  uniqueReports.forEach(r => {
    totalSummary.critical += r.summary.critical;
    totalSummary.high += r.summary.high;
    totalSummary.medium += r.summary.medium;
    totalSummary.low += r.summary.low;
    totalSummary.unknown += r.summary.unknown;
    totalFixable += r.fixable;
  });
  const total = totalSummary.critical + totalSummary.high + totalSummary.medium + totalSummary.low + totalSummary.unknown;

  return (
    <div style={panel}>
      <SectionHeader title="Vulnerability Summary" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: spacing[3], marginBottom: spacing[5] }}>
        <MetricCard label="Critical" value={String(totalSummary.critical)} />
        <MetricCard label="High" value={String(totalSummary.high)} />
        <MetricCard label="Medium" value={String(totalSummary.medium)} />
        <MetricCard label="Low" value={String(totalSummary.low)} />
        <MetricCard label="Fixable" value={String(totalFixable)} />
        <MetricCard label="Total" value={String(total)} />
      </div>

      <SectionHeader title="Container Images" />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Image', 'Critical', 'High', 'Medium', 'Low', 'Fixable', 'Scanned', ''].map(h => (
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
          {uniqueReports.map(report => (
            <tr key={report.reportName}>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                {report.image}:{report.tag || 'latest'}
              </td>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                {report.summary.critical > 0 ? <SeverityBadge severity="CRITICAL" /> : '0'}
                {report.summary.critical > 0 && ` ${report.summary.critical}`}
              </td>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                {report.summary.high > 0 ? <SeverityBadge severity="HIGH" /> : '0'}
                {report.summary.high > 0 && ` ${report.summary.high}`}
              </td>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                {report.summary.medium}
              </td>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                {report.summary.low}
              </td>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` }}>
                {report.fixable}
              </td>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, color: colors.gray500, borderBottom: `1px solid ${colors.gray100}` }}>
                {timeAgo(report.lastScanned)}
              </td>
              <td style={{ padding: `${spacing[2]}px ${spacing[3]}px`, borderBottom: `1px solid ${colors.gray100}` }}>
                <Button onClick={() => handleRescan(report)} disabled={rescanning === report.reportName}>
                  {rescanning === report.reportName ? 'Scanning...' : 'Rescan'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
