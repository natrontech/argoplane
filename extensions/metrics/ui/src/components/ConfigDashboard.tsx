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
import { DashboardConfig, DashboardRow, TimeRange, ViewMode } from '../types';
import { GraphPanel } from './GraphPanel';
import { DurationSelector } from './DurationSelector';
import { ViewModeToggle } from './ViewModeToggle';
import { PodSelector } from './PodSelector';

interface ConfigDashboardProps {
  applicationName: string;
  groupKind: string;
  namespace: string;
  name: string;
  namePattern?: string; // Override auto-computed name pattern (e.g., ".*" for namespace-wide)
  appNamespace: string;
  appName: string;
  project: string;
  pods?: string[];      // Available pod names (for pod selector)
  isWorkload?: boolean;  // Show pod selector + view mode toggle
}

export const ConfigDashboard: React.FC<ConfigDashboardProps> = ({
  applicationName, groupKind, namespace, name, namePattern,
  appNamespace, appName, project, pods, isWorkload,
}) => {
  const [config, setConfig] = React.useState<DashboardConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [duration, setDuration] = React.useState<TimeRange>('1h');
  const [viewMode, setViewMode] = React.useState<ViewMode>('pod');
  const [selectedPods, setSelectedPods] = React.useState<string[]>([]); // empty = all

  React.useEffect(() => {
    setLoading(true);
    fetchDashboardConfig(applicationName, groupKind, appNamespace, appName, project)
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, [applicationName, groupKind, appNamespace, appName, project]);

  if (loading) return <Loading />;

  if (!config || !config.rows || config.rows.length === 0) {
    return <EmptyState message="No dashboard configured for this resource type" />;
  }

  const rows = config.rows || [];

  // Filter rows by view mode: show rows matching current viewMode or rows with no groupBy (always visible)
  const visibleRows = rows.filter((r) => !r.groupBy || r.groupBy === viewMode);

  // Use explicit pattern if provided, otherwise auto-compute:
  // workloads: "name-.*", pods: exact "name"
  const nameParam = namePattern || (groupKind === 'pod' ? name : `${name}-.*`);

  const showControls = isWorkload && pods && pods.length > 0;

  return (
    <div>
      {/* Controls row: pod selector + view mode + duration */}
      <div style={headerRow}>
        <div style={leftControls}>
          {showControls && (
            <>
              <PodSelector
                pods={pods}
                selected={selectedPods}
                onChange={setSelectedPods}
              />
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </>
          )}
        </div>
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
                  pods={selectedPods.length > 0 ? selectedPods : undefined}
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

const leftControls: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[3],
  flexWrap: 'wrap',
};

const chartRow: React.CSSProperties = {
  display: 'flex',
  gap: spacing[3],
};

const chartCell: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};
