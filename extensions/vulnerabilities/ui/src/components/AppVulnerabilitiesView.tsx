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
import { fetchOverview, fetchReports, triggerRescan } from '../api';
import { ImageReport, OverviewResponse, Vulnerability } from '../types';

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

function totalVulns(summary: { critical: number; high: number; medium: number; low: number; unknown: number }): number {
  return summary.critical + summary.high + summary.medium + summary.low + summary.unknown;
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

// ============================================================
// Severity Badge
// ============================================================

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
// Summary Cards
// ============================================================

const SummaryCards: React.FC<{ summary: OverviewResponse['summary']; fixable: number }> = ({ summary, fixable }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: spacing[3], marginBottom: spacing[5] }}>
    <MetricCard label="Critical" value={String(summary.critical)} />
    <MetricCard label="High" value={String(summary.high)} />
    <MetricCard label="Medium" value={String(summary.medium)} />
    <MetricCard label="Low" value={String(summary.low)} />
    <MetricCard label="Fixable" value={String(fixable)} />
    <MetricCard label="Total" value={String(totalVulns(summary))} />
  </div>
);

// ============================================================
// Image Row
// ============================================================

const ImageRow: React.FC<{
  image: ImageReport;
  expanded: boolean;
  onToggle: () => void;
  onRescan: () => void;
  rescanning: boolean;
  vulns: Vulnerability[] | null;
  loadingVulns: boolean;
}> = ({ image, expanded, onToggle, onRescan, rescanning, vulns, loadingVulns }) => (
  <div style={{ border: `1px solid ${colors.gray200}`, borderRadius: 4, marginBottom: spacing[2] }}>
    <div
      onClick={onToggle}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto auto auto auto',
        alignItems: 'center',
        gap: spacing[3],
        padding: `${spacing[3]}px ${spacing[4]}px`,
        cursor: 'pointer',
        background: expanded ? colors.gray50 : 'transparent',
      }}
    >
      <div style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
        {image.registry ? `${image.registry}/` : ''}{image.image}:{image.tag || 'latest'}
      </div>
      <SeverityBadge severity="CRITICAL" />
      <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm }}>{image.summary.critical}</span>
      <SeverityBadge severity="HIGH" />
      <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm }}>{image.summary.high}</span>
      <span style={{ fontSize: fontSize.xs, color: colors.gray500 }}>{timeAgo(image.lastScanned)}</span>
      <span onClick={(e) => e.stopPropagation()}>
      <Button onClick={() => onRescan()} disabled={rescanning}>
        {rescanning ? 'Scanning...' : 'Rescan'}
      </Button>
      </span>
    </div>
    {expanded && (
      <div style={{ borderTop: `1px solid ${colors.gray200}`, padding: spacing[4] }}>
        {loadingVulns ? (
          <Loading />
        ) : vulns && vulns.length > 0 ? (
          <VulnerabilityTable vulns={vulns} />
        ) : (
          <div style={{ color: colors.gray500, fontSize: fontSize.sm }}>No vulnerabilities found.</div>
        )}
      </div>
    )}
  </div>
);

// ============================================================
// Vulnerability Table
// ============================================================

const headerCell: React.CSSProperties = {
  padding: `${spacing[2]}px ${spacing[3]}px`,
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  color: colors.gray500,
  borderBottom: `2px solid ${colors.gray200}`,
  textAlign: 'left',
};

const bodyCell: React.CSSProperties = {
  padding: `${spacing[2]}px ${spacing[3]}px`,
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
  borderBottom: `1px solid ${colors.gray100}`,
};

const VulnerabilityTable: React.FC<{ vulns: Vulnerability[] }> = ({ vulns }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead>
      <tr>
        <th style={headerCell}>CVE</th>
        <th style={headerCell}>Severity</th>
        <th style={headerCell}>Score</th>
        <th style={headerCell}>Package</th>
        <th style={headerCell}>Installed</th>
        <th style={headerCell}>Fixed</th>
      </tr>
    </thead>
    <tbody>
      {vulns.map((v, i) => (
        <tr key={`${v.id}-${i}`}>
          <td style={bodyCell}>
            {v.primaryLink ? (
              <a
                href={v.primaryLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.blueText, textDecoration: 'none' }}
              >
                {v.id}
              </a>
            ) : (
              v.id
            )}
          </td>
          <td style={bodyCell}><SeverityBadge severity={v.severity} /></td>
          <td style={bodyCell}>{v.score > 0 ? v.score.toFixed(1) : '-'}</td>
          <td style={bodyCell}>{v.package}</td>
          <td style={bodyCell}>{v.installedVersion}</td>
          <td style={{ ...bodyCell, color: v.fixedVersion ? colors.greenText : colors.gray400 }}>
            {v.fixedVersion || '-'}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

// ============================================================
// Main App View
// ============================================================

export const AppVulnerabilitiesView: React.FC<{ application: any; tree?: any }> = ({ application, tree }) => {
  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedImage, setExpandedImage] = React.useState<string | null>(null);
  const [imageVulns, setImageVulns] = React.useState<Record<string, Vulnerability[]>>({});
  const [loadingVulns, setLoadingVulns] = React.useState<string | null>(null);
  const [rescanning, setRescanning] = React.useState<string | null>(null);

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || 'default';

  // Collect pod names from tree.
  const podNames = React.useMemo(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.kind === 'Pod')
      .map((n: any) => n.name);
  }, [tree]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOverview(destNamespace, podNames, appNamespace, appName, project)
      .then(data => { if (!cancelled) setOverview(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [destNamespace, podNames.join(','), appNamespace, appName, project]);

  const handleToggle = (image: ImageReport) => {
    const key = `${image.registry}/${image.image}:${image.tag}`;
    if (expandedImage === key) {
      setExpandedImage(null);
      return;
    }
    setExpandedImage(key);

    if (!imageVulns[key]) {
      setLoadingVulns(key);
      fetchReports(image.podNamespace || destNamespace, appNamespace, appName, project, image.podName)
        .then(reports => {
          const match = reports.find(r => r.reportName === image.reportName);
          if (match?.vulnerabilities) {
            setImageVulns(prev => ({ ...prev, [key]: match.vulnerabilities! }));
          } else {
            setImageVulns(prev => ({ ...prev, [key]: [] }));
          }
        })
        .catch(() => setImageVulns(prev => ({ ...prev, [key]: [] })))
        .finally(() => setLoadingVulns(null));
    }
  };

  const handleRescan = (image: ImageReport) => {
    const key = `${image.registry}/${image.image}:${image.tag}`;
    setRescanning(key);
    triggerRescan(image.podNamespace || destNamespace, image.reportName, appNamespace, appName, project)
      .then(() => {
        // Remove cached vulns so they reload.
        setImageVulns(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      })
      .catch(err => setError(err.message))
      .finally(() => setRescanning(null));
  };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><EmptyState message={`Failed to load vulnerability data: ${error}`} /></div>;
  if (!overview || overview.images.length === 0) {
    return (
      <div style={panel}>
        <EmptyState message="No vulnerability reports found. The Trivy Operator scans images automatically when pods are created." />
      </div>
    );
  }

  return (
    <div style={panel}>
      <SectionHeader title="Vulnerability Summary" />
      <SummaryCards summary={overview.summary} fixable={overview.fixable} />

      <SectionHeader title="Container Images" />
      {overview.images.map(image => {
        const key = `${image.registry}/${image.image}:${image.tag}`;
        return (
          <ImageRow
            key={key}
            image={image}
            expanded={expandedImage === key}
            onToggle={() => handleToggle(image)}
            onRescan={() => handleRescan(image)}
            rescanning={rescanning === key}
            vulns={imageVulns[key] || null}
            loadingVulns={loadingVulns === key}
          />
        );
      })}
    </div>
  );
};
