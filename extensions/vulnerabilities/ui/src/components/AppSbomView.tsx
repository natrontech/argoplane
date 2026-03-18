import * as React from 'react';
import {
  Loading, EmptyState, Button, SectionHeader, MetricCard, Input,
  colors, fonts, fontSize, fontWeight, spacing, panel,
} from '@argoplane/shared';
import { fetchSbomOverview, downloadExport } from '../api';
import { SbomOverviewResponse, SbomComponent } from '../types';

type SortKey = 'name' | 'version' | 'type' | 'image';

const SortHeader: React.FC<{ label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void }> = ({ label, sortKey, active, dir, onClick }) => (
  <th onClick={() => onClick(sortKey)} style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: active === sortKey ? colors.orange500 : colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
    {label} {active === sortKey ? (dir === 'asc' ? '\u25B4' : '\u25BE') : ''}
  </th>
);

export const AppSbomView: React.FC<{ application: any; tree?: any }> = ({ application }) => {
  const [data, setData] = React.useState<SbomOverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [expandedImage, setExpandedImage] = React.useState<string | null>(null);

  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';
  const destNamespace = application?.spec?.destination?.namespace || 'default';

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchSbomOverview(destNamespace, appNamespace, appName, project, controller.signal)
      .then(d => { if (!controller.signal.aborted) setData(d); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [destNamespace, appNamespace, appName, project]);

  const handleSort = (key: SortKey) => { if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } };

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) return <div style={panel}><EmptyState message={`Failed to load: ${error}`} /></div>;
  if (!data || data.reports.length === 0) {
    return <div style={panel}><EmptyState message="No SBOM reports found. Enable sbomGenerationEnabled in the Trivy Operator." /></div>;
  }

  const bodyCell: React.CSSProperties = { padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.sm, fontFamily: fonts.mono, borderBottom: `1px solid ${colors.gray100}` };

  // Count unique component types across all images.
  const typeCounts: Record<string, number> = {};
  data.reports.forEach(r => r.components.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; }));

  return (
    <div style={panel}>
      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing[6], marginBottom: spacing[6] }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: spacing[3] }}>
            <MetricCard label="Total Components" value={String(data.totalComponents)} />
            <MetricCard label="Images" value={String(data.reports.length)} />
            {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => (
              <MetricCard key={type} label={type} value={String(count)} />
            ))}
          </div>
        </div>
        <Button onClick={() => downloadExport(destNamespace, 'sbom', appNamespace, appName, project)}>Export CSV</Button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: spacing[4] }}>
        <Input value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Search component name, version, purl..." style={{ maxWidth: 400 }} />
      </div>

      {/* Per-image sections */}
      <SectionHeader title="Software Bill of Materials" />
      {data.reports.map(report => {
        const key = `${report.image}:${report.tag}`;
        const expanded = expandedImage === key;
        const searchLower = search.toLowerCase();

        const filteredComponents = (report.components || [])
          .filter(c => !search || c.name.toLowerCase().includes(searchLower) || c.version.toLowerCase().includes(searchLower) || c.purl.toLowerCase().includes(searchLower))
          .sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
            else if (sortKey === 'version') cmp = a.version.localeCompare(b.version);
            else if (sortKey === 'type') cmp = a.type.localeCompare(b.type);
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
                {expanded ? '\u25BE' : '\u25B8'} {report.registry ? `${report.registry}/` : ''}{report.image}:{report.tag || 'latest'}
              </span>
              <span style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.gray500 }}>
                {report.componentsCount} components
              </span>
            </div>
            {expanded && (
              <div style={{ borderTop: `1px solid ${colors.gray200}`, padding: spacing[4] }}>
                {filteredComponents.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <SortHeader label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={handleSort} />
                        <SortHeader label="Version" sortKey="version" active={sortKey} dir={sortDir} onClick={handleSort} />
                        <SortHeader label="Type" sortKey="type" active={sortKey} dir={sortDir} onClick={handleSort} />
                        <th style={{ padding: `${spacing[2]}px ${spacing[3]}px`, fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', color: colors.gray500, borderBottom: `2px solid ${colors.gray200}`, textAlign: 'left' }}>PURL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComponents.map((c, i) => (
                        <tr key={`${c.name}-${c.version}-${i}`}>
                          <td style={bodyCell}>{c.name}</td>
                          <td style={bodyCell}>{c.version}</td>
                          <td style={{ ...bodyCell, fontSize: fontSize.xs }}>{c.type}</td>
                          <td style={{ ...bodyCell, fontSize: fontSize.xs, color: colors.gray500 }}>{c.purl}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ color: colors.gray500, fontSize: fontSize.sm }}>No components match the search.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
