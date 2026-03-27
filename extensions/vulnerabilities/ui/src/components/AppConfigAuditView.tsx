import * as React from 'react';
import {
  Loading,
  EmptyState,
  Button,
  SectionHeader,
  MetricCard,
  Input,
  ScopeToggle,
  extractWorkloadNames,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { useStickyScope } from '@argoplane/shared';
import { fetchAuditOverview, downloadExport } from '../api';
import { AuditOverviewResponse, AuditCheck, AuditReport } from '../types';
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
};

const severityBg: Record<string, string> = {
  CRITICAL: colors.redLight,
  HIGH: colors.orange100,
  MEDIUM: colors.yellowLight,
  LOW: colors.blueLight,
};

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

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

type SortKey = 'severity' | 'checkID' | 'title' | 'resource';

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
// Main Component
// ============================================================

export const AppConfigAuditView: React.FC<{ application: any; tree?: any }> = ({ application, tree }) => {
  const [data, setData] = React.useState<AuditOverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = React.useState<Set<string>>(new Set(SEVERITIES));
  const [search, setSearch] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('severity');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [expandedResource, setExpandedResource] = React.useState<string | null>(null);

  const [scope, setScope] = useStickyScope();

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || 'default';

  const workloads = React.useMemo(() => extractWorkloadNames(tree, destNamespace), [tree, destNamespace]);
  const scopedResources = scope === 'app' && workloads.length > 0 ? workloads : undefined;

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchAuditOverview(destNamespace, appNamespace, appName, project, controller.signal, scopedResources)
      .then(d => { if (!controller.signal.aborted) setData(d); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [destNamespace, appNamespace, appName, project, scopedResources]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleSeverity = (sev: string) => {
    setSeverityFilter(prev => { const next = new Set(prev); if (next.has(sev)) next.delete(sev); else next.add(sev); return next; });
  };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><EmptyState message={`Failed to load config audit data: ${error}`} /></div>;
  if (!data || data.reports.length === 0) {
    return <div style={panel}><EmptyState message="No config audit reports found. Enable configAuditScannerEnabled in the Trivy Operator." /></div>;
  }

  const s = data.summary;
  const pieSegments = [
    { label: 'Critical', value: s.critical, color: '#B91C1C' },
    { label: 'High', value: s.high, color: '#E8935A' },
    { label: 'Medium', value: s.medium, color: '#A16207' },
    { label: 'Low', value: s.low, color: '#1D4ED8' },
  ];

  // Flatten all checks with resource info for the flat table view.
  const searchLower = search.toLowerCase();
  const allChecks: Array<AuditCheck & { resource: string; kind: string }> = [];
  for (const report of data.reports) {
    for (const check of report.checks) {
      if (!severityFilter.has(check.severity)) continue;
      if (search && !check.checkID.toLowerCase().includes(searchLower) && !check.title.toLowerCase().includes(searchLower) && !check.remediation.toLowerCase().includes(searchLower) && !report.resourceName.toLowerCase().includes(searchLower)) continue;
      allChecks.push({ ...check, resource: report.resourceName, kind: report.resourceKind });
    }
  }

  allChecks.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'severity') cmp = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    else if (sortKey === 'checkID') cmp = a.checkID.localeCompare(b.checkID);
    else if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortKey === 'resource') cmp = a.resource.localeCompare(b.resource);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const total = s.critical + s.high + s.medium + s.low;
  const bodyCell: React.CSSProperties = {
    padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm,
    fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}`,
  };

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing[3] }}>
        <ScopeToggle value={scope} onChange={(s) => setScope(s)} />
      </div>
      {/* Summary row: pie chart + cards + export */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[6], marginBottom: spacing[6] }}>
        <PieChart segments={pieSegments} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: spacing[3] }}>
            <MetricCard label="Critical" value={String(s.critical)} />
            <MetricCard label="High" value={String(s.high)} />
            <MetricCard label="Medium" value={String(s.medium)} />
            <MetricCard label="Low" value={String(s.low)} />
            <MetricCard label="Total Failed" value={String(total)} />
          </div>
        </div>
        <Button onClick={() => downloadExport(destNamespace, 'audit', appNamespace, appName, project)}>
          Export CSV
        </Button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4], gap: spacing[3] }}>
        <Input
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          placeholder="Search check ID, title, resource..."
          style={{ maxWidth: 300 }}
        />
        <SeverityFilter selected={severityFilter} onToggle={toggleSeverity} />
      </div>

      {/* Checks table */}
      <SectionHeader title={`Failed Checks (${allChecks.length})`} />
      {allChecks.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="Check ID" sortKey="checkID" active={sortKey} dir={sortDir} onClick={handleSort} />
              <SortHeader label="Severity" sortKey="severity" active={sortKey} dir={sortDir} onClick={handleSort} />
              <SortHeader label="Resource" sortKey="resource" active={sortKey} dir={sortDir} onClick={handleSort} />
              <SortHeader label="Title" sortKey="title" active={sortKey} dir={sortDir} onClick={handleSort} />
              <th style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left' }}>Remediation</th>
            </tr>
          </thead>
          <tbody>
            {allChecks.map((c, i) => (
              <tr key={`${c.checkID}-${c.resource}-${i}`}>
                <td style={bodyCell}>{c.checkID}</td>
                <td style={bodyCell}><SeverityBadge severity={c.severity} /></td>
                <td style={{ ...bodyCell, fontSize: fontSize.xs }}>{c.kind}/{c.resource}</td>
                <td style={{ ...bodyCell, fontFamily: fonts.body, maxWidth: 300 }}>{c.title}</td>
                <td style={{ ...bodyCell, fontFamily: fonts.body, fontSize: fontSize.xs, color: colors.gray600, maxWidth: 400 }}>{c.remediation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: colors.gray500, fontSize: fontSize.sm }}>No failed checks match the current filter.</div>
      )}
    </div>
  );
};
