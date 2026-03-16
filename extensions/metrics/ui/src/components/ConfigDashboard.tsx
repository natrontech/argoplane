import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  radius,
} from '@argoplane/shared';
import { fetchDashboardConfig } from '../api';
import { DashboardConfig, DashboardRow, TimeRange } from '../types';
import { GraphPanel } from './GraphPanel';
import { DurationSelector } from './DurationSelector';

interface ConfigDashboardProps {
  applicationName: string;
  groupKind: string;
  namespace: string;
  name: string;
  namePattern?: string; // Override auto-computed name pattern (e.g., ".*" for namespace-wide)
  appNamespace: string;
  appName: string;
  project: string;
}

export const ConfigDashboard: React.FC<ConfigDashboardProps> = ({
  applicationName, groupKind, namespace, name, namePattern,
  appNamespace, appName, project,
}) => {
  const [config, setConfig] = React.useState<DashboardConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<string>('');
  const [duration, setDuration] = React.useState<TimeRange>('1h');

  React.useEffect(() => {
    setLoading(true);
    fetchDashboardConfig(applicationName, groupKind, appNamespace, appName, project)
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.tabs && cfg.tabs.length > 0) {
          setActiveTab(cfg.tabs[0]);
        }
      })
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, [applicationName, groupKind, appNamespace, appName, project]);

  if (loading) return <Loading />;

  if (!config || !config.rows || config.rows.length === 0) {
    return <EmptyState message="No dashboard configured for this resource type" />;
  }

  const tabs = config.tabs || [];
  const rows = config.rows || [];

  // Filter rows by active tab
  const visibleRows = activeTab
    ? rows.filter((r) => r.tab === activeTab || (!r.tab && activeTab === tabs[0]))
    : rows;

  // Use explicit pattern if provided, otherwise auto-compute:
  // workloads: "name-.*", pods: exact "name"
  const nameParam = namePattern || (groupKind === 'pod' ? name : `${name}-.*`);

  return (
    <div>
      {/* Tab bar + duration selector */}
      <div style={headerRow}>
        {tabs.length > 1 && (
          <div style={tabBar}>
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={tab === activeTab ? tabActive : tabBtn}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
        <DurationSelector value={duration} onChange={setDuration} />
      </div>

      {/* Rows of graphs */}
      {visibleRows.map((row) => (
        <div key={row.name} style={{ marginBottom: spacing[4] }}>
          <SectionHeader title={row.title} />
          <div style={chartRow}>
            {row.graphs.map((graph) => (
              <div key={graph.name} style={chartCell}>
                <GraphPanel
                  graph={graph}
                  row={row.name}
                  applicationName={applicationName}
                  groupKind={groupKind}
                  namespace={namespace}
                  name={nameParam}
                  duration={duration}
                  appNamespace={appNamespace}
                  appName={appName}
                  project={project}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- Styles ---

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[4],
  flexWrap: 'wrap',
  gap: spacing[2],
};

const tabBar: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: `1px solid ${colors.gray200}`,
};

const tabBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  padding: `${spacing[2]}px ${spacing[4]}px`,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  color: colors.gray500,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
};

const tabActive: React.CSSProperties = {
  ...tabBtn,
  color: colors.orange600,
  borderBottom: `2px solid ${colors.orange500}`,
};

const chartRow: React.CSSProperties = {
  display: 'flex',
  gap: spacing[3],
};

const chartCell: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};
