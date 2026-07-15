import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  Button,
  ScopeToggle,
  extractPodNames,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { useStickyScope } from '@argoplane/shared';
import { fetchAppMetrics, fetchPodBreakdown } from '../api';
import { MetricData, PodMetric } from '../types';
import { SERIES_COLORS } from '../utils/palette';
import { ConfigDashboard } from './ConfigDashboard';

interface AppViewProps {
  application: any;
  tree?: any;
}

const REFRESH_INTERVAL = 30_000;

interface Workload {
  kind: string;
  name: string;
}

export const AppMetricsView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [summary, setSummary] = React.useState<MetricData[]>([]);
  const [pods, setPods] = React.useState<PodMetric[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [scope, setScope] = useStickyScope();

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  // The tree object gets a fresh identity on every app refresh. Derive stable
  // string keys from the node names and memoize the arrays on those keys so
  // fetchAll (and thus the polling effect) only changes when content changes.
  const workloadsKey = ((tree?.nodes || []) as any[])
    .filter((n) => (n.kind === 'Deployment' || n.kind === 'StatefulSet') && n.namespace === namespace)
    .map((n) => `${n.kind}:${n.name}`)
    .sort()
    .join('|');
  const treeWorkloads = React.useMemo<Workload[]>(() => {
    if (!workloadsKey) return [];
    return workloadsKey.split('|').map((s) => {
      const [kind, name] = s.split(':');
      return { kind, name };
    });
  }, [workloadsKey]);

  const podsKey = ((tree?.nodes || []) as any[])
    .filter((n) => n.kind === 'Pod' && n.namespace === namespace)
    .map((n) => n.name)
    .sort()
    .join('|');
  const treePodNames = React.useMemo(() => (podsKey ? podsKey.split('|') : []), [podsKey]);

  const scopedPodNames = React.useMemo(() => {
    if (scope === 'namespace') return undefined;
    return treePodNames.length > 0 ? treePodNames : undefined;
  }, [scope, treePodNames]);

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const fetchAll = React.useCallback(() => {
    if (!namespace) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const metricsP = fetchAppMetrics(namespace, undefined, appNamespace, appName, project, scopedPodNames, controller.signal);

    // Fetch pod breakdowns for ALL workloads (Deployments and StatefulSets)
    // in the tree, then merge. Fall back to the app name if the tree is empty.
    const workloads: Workload[] = treeWorkloads.length > 0
      ? treeWorkloads
      : [{ kind: 'Deployment', name: appName }];
    const podNames = scope === 'app' && treePodNames.length > 0 ? treePodNames : undefined;
    const podsP = Promise.all(
      workloads.map((w) =>
        fetchPodBreakdown(namespace, w.name, w.kind, appNamespace, appName, project, podNames, controller.signal)),
    ).then((lists) => {
      const seen = new Set<string>();
      const merged: PodMetric[] = [];
      for (const list of lists) {
        for (const p of list || []) {
          if (!seen.has(p.pod)) {
            seen.add(p.pod);
            merged.push(p);
          }
        }
      }
      return merged;
    });

    Promise.all([metricsP, podsP])
      .then(([resp, podList]) => {
        if (controller.signal.aborted) return;
        setSummary(resp.summary || []);
        setPods(podList);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [namespace, appNamespace, appName, project, treePodNames, treeWorkloads, scope, scopedPodNames]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (!namespace) {
    return <div style={panel}><EmptyState message="No destination namespace configured for this application" /></div>;
  }

  if (loading && !loaded) return <div style={panel}><Loading /></div>;

  if (error && !loaded) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>
          Failed to load metrics: {error}
        </div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  if (summary.length === 0 && !error) {
    return <div style={panel}><EmptyState message="No metrics available. Is Prometheus running?" /></div>;
  }

  return (
    <div style={panel}>
      {error && (
        <div style={refreshErrorNote}>
          Refresh failed: {error}. Showing last loaded data.
        </div>
      )}

      {/* Scope toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing[3] }}>
        <ScopeToggle value={scope} onChange={setScope} />
      </div>

      {/* Overview */}
      <SectionHeader title="OVERVIEW" />
      <div style={cardGrid}>
        {summary.map((m) => (
          <MetricCard key={m.name} label={m.name} value={m.value} unit={m.unit} />
        ))}
      </div>

      {/* Config-driven charts with pod selector + view mode toggle */}
      <div style={{ marginTop: spacing[5] }}>
        <ConfigDashboard
          applicationName={appName}
          groupKind="deployment"
          namespace={namespace}
          name={appName}
          namePattern=".*"
          appNamespace={appNamespace}
          appName={appName}
          project={project}
          pods={pods.map((p) => p.pod)}
          scopedPods={scopedPodNames}
          isWorkload={true}
        />
      </div>

      {/* Pod table */}
      {pods.length > 0 && (
        <div style={{ marginTop: spacing[5] }}>
          <SectionHeader title="POD DETAILS" />
          <div style={podTableWrap}>
            <table style={podTable}>
              <thead>
                <tr>
                  <th style={th}>Pod</th>
                  <th style={th}>CPU</th>
                  <th style={th}>CPU Req</th>
                  <th style={th}>CPU Lim</th>
                  <th style={th}>Memory</th>
                  <th style={th}>Mem Req</th>
                  <th style={th}>Mem Lim</th>
                  <th style={th}>Net RX</th>
                  <th style={th}>Net TX</th>
                  <th style={th}>Restarts</th>
                </tr>
              </thead>
              <tbody>
                {pods.map((p, i) => {
                  const cpuVal = parseFloat(p.cpu);
                  const cpuLimVal = parseFloat(p.cpuLimit);
                  const memVal = parseFloat(p.memory);
                  const memLimVal = parseFloat(p.memoryLimit);
                  const cpuOverLimit = !isNaN(cpuVal) && !isNaN(cpuLimVal) && cpuLimVal > 0 && cpuVal >= cpuLimVal;
                  const memOverLimit = !isNaN(memVal) && !isNaN(memLimVal) && memLimVal > 0 && memVal >= memLimVal;
                  return (
                    <tr key={p.pod}>
                      <td style={td}>
                        <span style={{ ...podDot, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                        {p.pod}
                      </td>
                      <td style={{ ...td, color: cpuOverLimit ? colors.redText : undefined }}>{p.cpu}m</td>
                      <td style={tdDim}>{p.cpuRequest !== '-' ? `${p.cpuRequest}m` : '-'}</td>
                      <td style={tdDim}>{p.cpuLimit !== '-' ? `${p.cpuLimit}m` : '-'}</td>
                      <td style={{ ...td, color: memOverLimit ? colors.redText : undefined }}>{p.memory} MiB</td>
                      <td style={tdDim}>{p.memoryRequest !== '-' ? `${p.memoryRequest} MiB` : '-'}</td>
                      <td style={tdDim}>{p.memoryLimit !== '-' ? `${p.memoryLimit} MiB` : '-'}</td>
                      <td style={td}>{p.netRx} KB/s</td>
                      <td style={td}>{p.netTx} KB/s</td>
                      <td style={{
                        ...td,
                        color: Number(p.restarts) > 0 ? colors.redText : undefined,
                      }}>
                        {p.restarts}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Styles ---

const refreshErrorNote: React.CSSProperties = {
  padding: `${spacing[1]}px ${spacing[3]}px`,
  marginBottom: spacing[3],
  backgroundColor: colors.yellowLight,
  border: `1px solid ${colors.yellow}`,
  borderRadius: 4,
  color: colors.yellowText,
  fontFamily: fonts.mono,
  fontSize: fontSize.xs,
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: spacing[3],
};

const podTableWrap: React.CSSProperties = {
  overflowX: 'auto',
};

const podTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
};

const th: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.gray500,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderBottom: `2px solid ${colors.gray200}`,
  textAlign: 'left',
};

const td: React.CSSProperties = {
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderBottom: `1px solid ${colors.gray100}`,
  color: colors.gray800,
};

const tdDim: React.CSSProperties = {
  ...td,
  color: colors.gray500,
};

const podDot: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: 1,
  marginRight: spacing[2],
  verticalAlign: 'middle',
};
