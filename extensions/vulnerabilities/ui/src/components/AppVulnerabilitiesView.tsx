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
import { fetchOverview, triggerRescan } from '../api';
import { ImageReport, OverviewResponse } from '../types';

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

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  UNKNOWN: 4,
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
// Severity Filter
// ============================================================

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const;

const SeverityFilter: React.FC<{
  selected: Set<string>;
  onToggle: (sev: string) => void;
}> = ({ selected, onToggle }) => (
  <div style={{ display: 'flex', gap: spacing[2] }}>
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

// ============================================================
// Image Section (expandable with inline vulns)
// ============================================================

const ImageSection: React.FC<{
  image: ImageReport;
  expanded: boolean;
  onToggle: () => void;
  onRescan: () => void;
  rescanning: boolean;
  severityFilter: Set<string>;
}> = ({ image, expanded, onToggle, onRescan, rescanning, severityFilter }) => {
  const vulns = (image.vulnerabilities || [])
    .filter(v => severityFilter.has(v.severity))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99) || b.score - a.score);

  return (
    <div style={{ border: `1px solid ${colors.gray200}`, borderRadius: 4, marginBottom: spacing[3] }}>
      {/* Image header row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing[3]}px ${spacing[4]}px`,
          cursor: 'pointer',
          background: expanded ? colors.gray50 : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3], flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
            {expanded ? '\u25BE' : '\u25B8'}{' '}
            {image.registry ? `${image.registry}/` : ''}{image.image}:{image.tag || 'latest'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3], flexShrink: 0 }}>
          {image.summary.critical > 0 && <span><SeverityBadge severity="CRITICAL" /> <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm }}>{image.summary.critical}</span></span>}
          {image.summary.high > 0 && <span><SeverityBadge severity="HIGH" /> <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm }}>{image.summary.high}</span></span>}
          {image.summary.medium > 0 && <span style={{ fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.gray500 }}>{image.summary.medium} med</span>}
          {image.summary.low > 0 && <span style={{ fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.gray500 }}>{image.summary.low} low</span>}
          <span style={{ fontSize: fontSize.xs, color: colors.gray500 }}>{timeAgo(image.lastScanned)}</span>
          <span onClick={(e) => e.stopPropagation()}>
            <Button onClick={() => onRescan()} disabled={rescanning}>
              {rescanning ? 'Scanning...' : 'Rescan'}
            </Button>
          </span>
        </div>
      </div>

      {/* Expanded vulnerability table */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${colors.gray200}`, padding: spacing[4] }}>
          {vulns.length > 0 ? (
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
                        <a href={v.primaryLink} target="_blank" rel="noopener noreferrer" style={{ color: colors.blueText, textDecoration: 'none' }}>
                          {v.id}
                        </a>
                      ) : v.id}
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
          ) : (
            <div style={{ color: colors.gray500, fontSize: fontSize.sm }}>
              No vulnerabilities match the current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Main App View
// ============================================================

export const AppVulnerabilitiesView: React.FC<{ application: any; tree?: any }> = ({ application, tree }) => {
  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedImage, setExpandedImage] = React.useState<string | null>(null);
  const [rescanning, setRescanning] = React.useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = React.useState<Set<string>>(new Set(SEVERITIES));

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || 'default';

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetchOverview(destNamespace, appNamespace, appName, project)
      .then(data => setOverview(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [destNamespace, appNamespace, appName, project]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const handleRescan = (image: ImageReport) => {
    const key = `${image.registry}/${image.image}:${image.tag}`;
    setRescanning(key);
    triggerRescan(image.resourceNamespace || destNamespace, image.reportName, appNamespace, appName, project)
      .then(() => {
        // Reload after a short delay to let the operator recreate the report.
        setTimeout(loadData, 3000);
      })
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4] }}>
        <SectionHeader title="Container Images" />
        <SeverityFilter selected={severityFilter} onToggle={toggleSeverity} />
      </div>

      {overview.images.map(image => {
        const key = `${image.registry}/${image.image}:${image.tag}`;
        return (
          <ImageSection
            key={key}
            image={image}
            expanded={expandedImage === key}
            onToggle={() => setExpandedImage(prev => prev === key ? null : key)}
            onRescan={() => handleRescan(image)}
            rescanning={rescanning === key}
            severityFilter={severityFilter}
          />
        );
      })}
    </div>
  );
};
