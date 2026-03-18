import * as React from 'react';
import {
  Loading, EmptyState, Button, SectionHeader, MetricCard, Input,
  colors, fonts, fontSize, fontWeight, spacing, panel,
} from '@argoplane/shared';
import { fetchSecretsOverview, downloadExport } from '../api';
import { SecretOverviewResponse, ExposedSecret } from '../types';
import { PieChart } from './PieChart';

const severityColor: Record<string, string> = { CRITICAL: colors.redText, HIGH: colors.orange500, MEDIUM: colors.yellowText, LOW: colors.blueText };
const severityBg: Record<string, string> = { CRITICAL: colors.redLight, HIGH: colors.orange100, MEDIUM: colors.yellowLight, LOW: colors.blueLight };
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => (
  <span style={{ display: 'inline-block', padding: '1px 6px', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, fontFamily: fonts.mono, color: severityColor[severity] || colors.gray600, background: severityBg[severity] || colors.gray100, borderRadius: 2, textTransform: 'uppercase' }}>{severity}</span>
);

const SeverityFilter: React.FC<{ selected: Set<string>; onToggle: (s: string) => void }> = ({ selected, onToggle }) => (
  <div style={{ display: 'flex', gap: spacing[2] }}>
    {SEVERITIES.map(sev => (
      <button key={sev} onClick={() => onToggle(sev)} style={{ padding: '2px 8px', fontSize: fontSize.xs, fontWeight: fontWeight.medium, fontFamily: fonts.mono, border: `1px solid ${selected.has(sev) ? (severityColor[sev] || colors.gray400) : colors.gray200}`, borderRadius: 2, background: selected.has(sev) ? (severityBg[sev] || colors.gray100) : 'transparent', color: selected.has(sev) ? (severityColor[sev] || colors.gray600) : colors.gray500, cursor: 'pointer' }}>{sev}</button>
    ))}
  </div>
);

type SortKey = 'severity' | 'ruleID' | 'category' | 'target';

const SortHeader: React.FC<{ label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void }> = ({ label, sortKey, active, dir, onClick }) => (
  <th onClick={() => onClick(sortKey)} style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: active === sortKey ? colors.orange500 : colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
    {label} {active === sortKey ? (dir === 'asc' ? '\u25B4' : '\u25BE') : ''}
  </th>
);

export const AppExposedSecretsView: React.FC<{ application: any; tree?: any }> = ({ application }) => {
  const [data, setData] = React.useState<SecretOverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = React.useState<Set<string>>(new Set(SEVERITIES));
  const [search, setSearch] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('severity');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || 'default';

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchSecretsOverview(destNamespace, appNamespace, appName, project, controller.signal)
      .then(d => { if (!controller.signal.aborted) setData(d); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [destNamespace, appNamespace, appName, project]);

  const handleSort = (key: SortKey) => { if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } };
  const toggleSeverity = (sev: string) => { setSeverityFilter(prev => { const next = new Set(prev); if (next.has(sev)) next.delete(sev); else next.add(sev); return next; }); };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><EmptyState message={`Failed to load: ${error}`} /></div>;
  if (!data || data.reports.length === 0) {
    return <div style={panel}><EmptyState message="No exposed secret reports found. Enable exposedSecretScannerEnabled in the Trivy Operator." /></div>;
  }

  const s = data.summary;
  const total = s.critical + s.high + s.medium + s.low;
  const pieSegments = [
    { label: 'Critical', value: s.critical, color: '#B91C1C' },
    { label: 'High', value: s.high, color: '#E8935A' },
    { label: 'Medium', value: s.medium, color: '#A16207' },
    { label: 'Low', value: s.low, color: '#1D4ED8' },
  ];

  const searchLower = search.toLowerCase();
  const allSecrets: Array<ExposedSecret & { image: string; container: string }> = [];
  for (const report of data.reports) {
    for (const secret of report.secrets) {
      if (!severityFilter.has(secret.severity)) continue;
      if (search && !secret.ruleID.toLowerCase().includes(searchLower) && !secret.title.toLowerCase().includes(searchLower) && !secret.category.toLowerCase().includes(searchLower) && !secret.target.toLowerCase().includes(searchLower)) continue;
      allSecrets.push({ ...secret, image: `${report.image}:${report.tag}`, container: report.containerName });
    }
  }

  allSecrets.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'severity') cmp = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    else if (sortKey === 'ruleID') cmp = a.ruleID.localeCompare(b.ruleID);
    else if (sortKey === 'category') cmp = a.category.localeCompare(b.category);
    else if (sortKey === 'target') cmp = a.target.localeCompare(b.target);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const bodyCell: React.CSSProperties = { padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` };

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[6], marginBottom: spacing[6] }}>
        <PieChart segments={pieSegments} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: spacing[3] }}>
            <MetricCard label="Critical" value={String(s.critical)} />
            <MetricCard label="High" value={String(s.high)} />
            <MetricCard label="Medium" value={String(s.medium)} />
            <MetricCard label="Low" value={String(s.low)} />
            <MetricCard label="Total" value={String(total)} />
          </div>
        </div>
        <Button onClick={() => downloadExport(destNamespace, 'secrets', appNamespace, appName, project)}>Export CSV</Button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[4], gap: spacing[3] }}>
        <Input value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Search rule, category, target..." style={{ maxWidth: 300 }} />
        <SeverityFilter selected={severityFilter} onToggle={toggleSeverity} />
      </div>

      <SectionHeader title={`Exposed Secrets (${allSecrets.length})`} />
      {allSecrets.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="Rule ID" sortKey="ruleID" active={sortKey} dir={sortDir} onClick={handleSort} />
              <SortHeader label="Severity" sortKey="severity" active={sortKey} dir={sortDir} onClick={handleSort} />
              <SortHeader label="Category" sortKey="category" active={sortKey} dir={sortDir} onClick={handleSort} />
              <th style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left' }}>Title</th>
              <SortHeader label="Target" sortKey="target" active={sortKey} dir={sortDir} onClick={handleSort} />
              <th style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left' }}>Image</th>
            </tr>
          </thead>
          <tbody>
            {allSecrets.map((s, i) => (
              <tr key={`${s.ruleID}-${s.target}-${i}`}>
                <td style={bodyCell}>{s.ruleID}</td>
                <td style={bodyCell}><SeverityBadge severity={s.severity} /></td>
                <td style={bodyCell}>{s.category}</td>
                <td style={{ ...bodyCell, fontFamily: fonts.body, maxWidth: 300 }}>{s.title}</td>
                <td style={{ ...bodyCell, fontSize: fontSize.xs }}>{s.target}</td>
                <td style={{ ...bodyCell, fontSize: fontSize.xs }}>{s.image}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: colors.gray500, fontSize: fontSize.sm }}>No exposed secrets match the current filter.</div>
      )}
    </div>
  );
};
