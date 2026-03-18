import * as React from 'react';
import {
  Loading,
  EmptyState,
  Button,
  SectionHeader,
  MetricCard,
  Input,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchOverview, downloadExport } from '../api';
import { ImageReport, OverviewResponse, Vulnerability } from '../types';
import { PieChart } from './PieChart';

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

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const;

// ============================================================
// Severity Badge
// ============================================================

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => (
  <span style={{
    display: 'inline-block', padding: '1px 6px', fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold, fontFamily: fonts.mono,
    color: severityColor[severity] || colors.gray600,
    background: severityBg[severity] || colors.gray100,
    borderRadius: 2, textTransform: 'uppercase',
  }}>
    {severity}
  </span>
);

// ============================================================
// Severity Filter
// ============================================================

const SeverityFilter: React.FC<{ selected: Set<string>; onToggle: (s: string) => void }> = ({ selected, onToggle }) => (
  <div style={{ display: 'flex', gap: spacing[2] }}>
    {SEVERITIES.map(sev => (
      <button key={sev} onClick={() => onToggle(sev)} style={{
        padding: '2px 8px', fontSize: fontSize.xs, fontWeight: fontWeight.medium, fontFamily: fonts.mono,
        border: `1px solid ${selected.has(sev) ? (severityColor[sev] || colors.gray400) : colors.gray200}`,
        borderRadius: 2,
        background: selected.has(sev) ? (severityBg[sev] || colors.gray100) : 'transparent',
        color: selected.has(sev) ? (severityColor[sev] || colors.gray600) : colors.gray500,
        cursor: 'pointer',
      }}>
        {sev}
      </button>
    ))}
  </div>
);

// ============================================================
// Sortable Header
// ============================================================

type SortKey = 'severity' | 'score' | 'package' | 'id';

const SortHeader: React.FC<{ label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void }> = ({ label, sortKey, active, dir, onClick }) => (
  <th onClick={() => onClick(sortKey)} style={{
    padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
    textTransform: 'uppercase', color: active === sortKey ? colors.orange500 : colors.gray500,
    borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', cursor: 'pointer', userSelect: 'none',
  }}>
    {label} {active === sortKey ? (dir === 'asc' ? '\u25B4' : '\u25BE') : ''}
  </th>
);

// ============================================================
// Main App View
// ============================================================

export const AppVulnerabilitiesView: React.FC<{ application: any; tree?: any }> = ({ application }) => {
  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedImage, setExpandedImage] = React.useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = React.useState<Set<string>>(new Set(SEVERITIES));
  const [search, setSearch] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('severity');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

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

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleSeverity = (sev: string) => {
    setSeverityFilter(prev => { const next = new Set(prev); if (next.has(sev)) next.delete(sev); else next.add(sev); return next; });
  };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><EmptyState message={`Failed to load vulnerability data: ${error}`} /></div>;
  if (!overview || overview.images.length === 0) {
    return <div style={panel}><EmptyState message="No vulnerability reports found. The Trivy Operator scans images automatically when pods are created." /></div>;
  }

  const s = overview.summary;
  const pieSegments = [
    { label: 'Critical', value: s.critical, color: '#B91C1C' },
    { label: 'High', value: s.high, color: '#E8935A' },
    { label: 'Medium', value: s.medium, color: '#A16207' },
    { label: 'Low', value: s.low, color: '#1D4ED8' },
    { label: 'Unknown', value: s.unknown, color: '#78716C' },
  ];

  const bodyCell: React.CSSProperties = {
    padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm,
    fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}`,
  };

  return (
    <div style={panel}>
      {/* Summary row: pie chart + metric cards + export */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[6], marginBottom: spacing[6] }}>
        <PieChart segments={pieSegments} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: spacing[3] }}>
            <MetricCard label="Critical" value={String(s.critical)} />
            <MetricCard label="High" value={String(s.high)} />
            <MetricCard label="Medium" value={String(s.medium)} />
            <MetricCard label="Low" value={String(s.low)} />
            <MetricCard label="Fixable" value={String(overview.fixable)} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
          <span style={{ fontSize: fontSize.xs, color: colors.gray500, fontFamily: fonts.mono }}>
            Scans run automatically by the Trivy Operator
          </span>
          <Button onClick={() => downloadExport(destNamespace, 'vulnerabilities', appNamespace, appName, project)}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Toolbar: search + severity filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4], gap: spacing[3] }}>
        <Input
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          placeholder="Search CVE, package, title..."
          style={{ maxWidth: 300 }}
        />
        <SeverityFilter selected={severityFilter} onToggle={toggleSeverity} />
      </div>

      {/* Image sections */}
      <SectionHeader title="Container Images" />
      {overview.images.map(image => {
        const key = `${image.registry}/${image.image}:${image.tag}`;
        const expanded = expandedImage === key;

        // Filter and sort vulnerabilities.
        const searchLower = search.toLowerCase();
        const vulns = (image.vulnerabilities || [])
          .filter(v => severityFilter.has(v.severity))
          .filter(v => !search || v.id.toLowerCase().includes(searchLower) || v.package.toLowerCase().includes(searchLower) || v.title.toLowerCase().includes(searchLower))
          .sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'severity') cmp = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
            else if (sortKey === 'score') cmp = b.score - a.score;
            else if (sortKey === 'package') cmp = a.package.localeCompare(b.package);
            else if (sortKey === 'id') cmp = a.id.localeCompare(b.id);
            return sortDir === 'desc' ? -cmp : cmp;
          });

        return (
          <div key={key} style={{ border: `1px solid ${colors.gray200}`, borderRadius: 4, marginBottom: spacing[3] }}>
            <div onClick={() => setExpandedImage(prev => prev === key ? null : key)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${spacing[3]}px ${spacing[4]}px`, cursor: 'pointer',
              background: expanded ? colors.gray50 : 'transparent',
            }}>
              <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
                {expanded ? '\u25BE' : '\u25B8'}{' '}
                {image.registry ? `${image.registry}/` : ''}{image.image}:{image.tag || 'latest'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                {image.summary.critical > 0 && <span><SeverityBadge severity="CRITICAL" /> {image.summary.critical}</span>}
                {image.summary.high > 0 && <span><SeverityBadge severity="HIGH" /> {image.summary.high}</span>}
                {image.summary.medium > 0 && <span style={{ fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.gray500 }}>{image.summary.medium} med</span>}
                <span style={{ fontSize: fontSize.xs, color: colors.gray500 }}>{timeAgo(image.lastScanned)}</span>
              </div>
            </div>
            {expanded && (
              <div style={{ borderTop: `1px solid ${colors.gray200}`, padding: spacing[4] }}>
                {vulns.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <SortHeader label="CVE" sortKey="id" active={sortKey} dir={sortDir} onClick={handleSort} />
                        <SortHeader label="Severity" sortKey="severity" active={sortKey} dir={sortDir} onClick={handleSort} />
                        <SortHeader label="Score" sortKey="score" active={sortKey} dir={sortDir} onClick={handleSort} />
                        <SortHeader label="Package" sortKey="package" active={sortKey} dir={sortDir} onClick={handleSort} />
                        <th style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left' }}>Installed</th>
                        <th style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left' }}>Fixed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vulns.map((v, i) => (
                        <tr key={`${v.id}-${i}`}>
                          <td style={bodyCell}>
                            {v.primaryLink ? <a href={v.primaryLink} target="_blank" rel="noopener noreferrer" style={{ color: colors.blueText, textDecoration: 'none' }}>{v.id}</a> : v.id}
                          </td>
                          <td style={bodyCell}><SeverityBadge severity={v.severity} /></td>
                          <td style={bodyCell}>{v.score > 0 ? v.score.toFixed(1) : '-'}</td>
                          <td style={bodyCell}>{v.package}</td>
                          <td style={bodyCell}>{v.installedVersion}</td>
                          <td style={{ ...bodyCell, color: v.fixedVersion ? colors.greenText : colors.gray400 }}>{v.fixedVersion || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ color: colors.gray500, fontSize: fontSize.sm }}>No vulnerabilities match the current filter.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
