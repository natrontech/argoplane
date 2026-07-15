import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  MetricCard,
  MetaRow,
  Button,
  colors,
  fonts,
  fontSize,
  fontWeight,
  panel,
  spacing,
} from '@argoplane/shared';
import { fetchMetrics, fetchPodBreakdown } from '../api';
import { ExtensionProps, MetricData, PodMetric } from '../types';
import { SERIES_COLORS } from '../utils/palette';
import { ConfigDashboard } from './ConfigDashboard';

const REFRESH_INTERVAL = 30_000;

export const MetricsPanel: React.FC<ExtensionProps> = ({ resource, application }) => {
  const [metrics, setMetrics] = React.useState<MetricData[]>([]);
  const [pods, setPods] = React.useState<PodMetric[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const namespace = resource?.metadata?.namespace || '';
  const name = resource?.metadata?.name || '';
  const kind = resource?.kind || 'Deployment';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const isWorkload = kind === 'Deployment' || kind === 'StatefulSet';

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const fetchAll = React.useCallback(() => {
    if (!namespace || !name) {
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const promises: Promise<any>[] = [
      fetchMetrics(namespace, name, kind, appNamespace, appName, project, controller.signal),
    ];

    if (isWorkload) {
      promises.push(
        fetchPodBreakdown(namespace, name, kind, appNamespace, appName, project, undefined, controller.signal).catch(() => []),
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    Promise.all(promises)
      .then(([instant, podList]) => {
        if (controller.signal.aborted) return;
        setMetrics(instant);
        setPods(podList);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [namespace, name, kind, isWorkload, appNamespace, appName, project]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (!namespace || !name) {
    return <EmptyState message="No namespace or name available for this resource" />;
  }

  if (loading && !loaded) return <Loading />;

  if (error && !loaded) {
    return (
      <div style={{ ...panel, color: colors.redText }}>
        <div style={{ marginBottom: spacing[2] }}>Failed to load metrics: {error}</div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  if (metrics.length === 0 && !error) {
    return <EmptyState message={`No metrics available for ${kind} ${namespace}/${name}`} />;
  }

  return (
    <div style={panel}>
      {error && (
        <div style={refreshErrorNote}>
          Refresh failed: {error}. Showing last loaded data.
        </div>
      )}

      {/* Header */}
      <div style={headerRow}>
        <MetaRow items={[
          { label: 'Kind', value: kind },
          { label: 'Namespace', value: namespace },
          { label: 'Resource', value: name },
          ...(isWorkload && pods.length > 0 ? [{ label: 'Pods', value: String(pods.length) }] : []),
        ]} />
      </div>

      {/* Summary cards */}
      <div style={cardGrid}>
        {metrics.map((m) => (
          <MetricCard key={m.name} label={m.name} value={m.value} unit={m.unit} />
        ))}
      </div>

      {/* Config-driven charts with pod selector + view mode toggle */}
      <div style={{ marginTop: spacing[5] }}>
        <ConfigDashboard
          applicationName={appName}
          groupKind={kind.toLowerCase()}
          namespace={namespace}
          name={name}
          appNamespace={appNamespace}
          appName={appName}
          project={project}
          pods={isWorkload ? pods.map((p) => p.pod) : undefined}
          isWorkload={isWorkload}
        />
      </div>

      {/* Pod table */}
      {isWorkload && pods.length > 0 && (
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

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[4],
  flexWrap: 'wrap',
  gap: spacing[2],
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
