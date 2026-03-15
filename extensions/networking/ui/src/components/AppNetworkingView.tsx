import * as React from 'react';
import {
  Loading,
  EmptyState,
  SectionHeader,
  StatusBadge,
  Tag,
  Button,
  Input,
  colors,
  fonts,
  fontSize,
  fontWeight,
  spacing,
  panel,
} from '@argoplane/shared';
import { fetchPoliciesWithOwnership, fetchEndpoints, fetchFlows } from '../api';
import {
  PolicySummary,
  EndpointSummary,
  FlowSummary,
  FlowsResponse,
  ResourceRef,
  VerdictFilter,
  TimeRange,
} from '../types';

// --- Aggregation types ---

interface AggregatedConnection {
  direction: 'outbound' | 'inbound';
  remoteLabel: string; // display name
  protocol: string;
  port: number;
  forwarded: number;
  dropped: number;
  errors: number;
  dropReasons: string[];
}

interface PodTraffic {
  pod: string;
  connections: AggregatedConnection[];
  totalForwarded: number;
  totalDropped: number;
  totalErrors: number;
}

// --- Flow aggregation ---

function aggregateFlows(flows: FlowSummary[], namespace: string): PodTraffic[] {
  // Group by local pod, then by remote+protocol+port+direction.
  const podMap = new Map<string, Map<string, AggregatedConnection>>();

  for (const f of flows) {
    const isSourceLocal = f.sourceNamespace === namespace && f.sourcePod;
    const isDestLocal = f.destNamespace === namespace && f.destPod;

    // Determine the local pod and direction.
    let localPod: string;
    let direction: 'outbound' | 'inbound';
    let remoteLabel: string;

    if (isSourceLocal && !isDestLocal) {
      localPod = f.sourcePod;
      direction = 'outbound';
      remoteLabel = f.destPod
        ? (f.destNamespace === namespace ? f.destPod : `${f.destNamespace}/${f.destPod}`)
        : f.destDNS || f.destIP || 'unknown';
    } else if (isDestLocal && !isSourceLocal) {
      localPod = f.destPod;
      direction = 'inbound';
      remoteLabel = f.sourcePod
        ? (f.sourceNamespace === namespace ? f.sourcePod : `${f.sourceNamespace}/${f.sourcePod}`)
        : f.sourceIP || 'unknown';
    } else if (isSourceLocal && isDestLocal) {
      // Internal traffic: show from source perspective.
      localPod = f.sourcePod;
      direction = 'outbound';
      remoteLabel = f.destPod;
    } else {
      continue; // Neither side is local.
    }

    const proto = f.destPort > 0 ? `${f.protocol}:${f.destPort}` : f.protocol || '';
    const connKey = `${direction}|${remoteLabel}|${proto}`;

    if (!podMap.has(localPod)) {
      podMap.set(localPod, new Map());
    }
    const connMap = podMap.get(localPod)!;

    if (!connMap.has(connKey)) {
      connMap.set(connKey, {
        direction,
        remoteLabel,
        protocol: f.protocol,
        port: f.destPort,
        forwarded: 0,
        dropped: 0,
        errors: 0,
        dropReasons: [],
      });
    }
    const conn = connMap.get(connKey)!;

    if (f.verdict === 'FORWARDED') conn.forwarded++;
    else if (f.verdict === 'DROPPED') {
      conn.dropped++;
      if (f.dropReason && !conn.dropReasons.includes(f.dropReason)) {
        conn.dropReasons.push(f.dropReason);
      }
    } else if (f.verdict === 'ERROR') conn.errors++;
  }

  const result: PodTraffic[] = [];
  for (const [pod, connMap] of podMap) {
    const connections = Array.from(connMap.values());
    // Sort: dropped first, then by total volume.
    connections.sort((a, b) => (b.dropped - a.dropped) || ((b.forwarded + b.dropped) - (a.forwarded + a.dropped)));

    result.push({
      pod,
      connections,
      totalForwarded: connections.reduce((s, c) => s + c.forwarded, 0),
      totalDropped: connections.reduce((s, c) => s + c.dropped, 0),
      totalErrors: connections.reduce((s, c) => s + c.errors, 0),
    });
  }

  // Sort pods: those with drops first.
  result.sort((a, b) => (b.totalDropped - a.totalDropped) || ((b.totalForwarded + b.totalDropped) - (a.totalForwarded + a.totalDropped)));
  return result;
}

// --- Main component ---

interface AppViewProps {
  application: any;
  tree?: any;
}

const REFRESH_INTERVAL = 30_000;

export const AppNetworkingView: React.FC<AppViewProps> = ({ application, tree }) => {
  const [policies, setPolicies] = React.useState<PolicySummary[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedPod, setSelectedPod] = React.useState<string | null>(null);

  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('5m');

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.namespace === namespace || !n.namespace)
      .map((n: any) => ({
        group: n.group || '',
        kind: n.kind,
        namespace: n.namespace || '',
        name: n.name,
      }));
  }, [tree, namespace]);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;

    const policiesP = fetchPoliciesWithOwnership(namespace, resourceRefs, appNamespace, appName, project)
      .catch(() => [] as PolicySummary[]);
    const endpointsP = fetchEndpoints(namespace, appNamespace, appName, project)
      .catch(() => [] as EndpointSummary[]);
    const flowsP = fetchFlows(namespace, appNamespace, appName, project, timeRange, 500, verdictFilter)
      .catch(() => ({ flows: [], hubble: false } as FlowsResponse));

    Promise.all([policiesP, endpointsP, flowsP])
      .then(([pol, ep, fl]) => {
        setPolicies(pol);
        setEndpoints(ep);
        setFlowsResponse(fl);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, resourceRefs, timeRange, verdictFilter]);

  React.useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  React.useEffect(() => {
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <div style={panel}><Loading /></div>;

  if (error) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>
          Failed to load networking data: {error}
        </div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  const flows = flowsResponse?.flows || [];
  const flowSummary = flowsResponse?.summary;
  const hubbleAvailable = flowsResponse?.hubble ?? false;
  const podTraffic = React.useMemo(() => aggregateFlows(flows, namespace), [flows, namespace]);

  // Find endpoint info for selected pod.
  const selectedEndpoint = selectedPod
    ? endpoints.find((ep) => ep.name === selectedPod)
    : null;

  // Find policies relevant to selected pod (by matching endpoint selector labels).
  const selectedPodPolicies = React.useMemo(() => {
    if (!selectedPod) return policies;
    const ep = endpoints.find((e) => e.name === selectedPod);
    if (!ep?.labels) return policies;
    return policies.filter((p) => {
      if (!p.endpointSelector) return true; // selects all
      return Object.entries(p.endpointSelector).every(
        ([k, v]) => ep.labels && ep.labels[`k8s:${k}`] === v
      );
    });
  }, [selectedPod, endpoints, policies]);

  return (
    <div style={rootPanel}>
      {/* === Top strip: summary + controls === */}
      <div style={topStrip}>
        <div style={summaryRow}>
          <span style={appLabel}>{appName}</span>
          <span style={nsMeta}>{namespace}</span>

          {hubbleAvailable && flowSummary && (
            <>
              <span style={metricDivider} />
              <MiniMetric label="flows" value={flowSummary.total} />
              <MiniMetric label="fwd" value={flowSummary.forwarded} color={colors.greenText} />
              <MiniMetric label="drop" value={flowSummary.dropped} color={flowSummary.dropped > 0 ? colors.redText : undefined} />
              <MiniMetric label="err" value={flowSummary.error} color={flowSummary.error > 0 ? colors.yellowText : undefined} />
            </>
          )}
        </div>

        <div style={controlsRow}>
          {/* Time range */}
          {(['5m', '15m', '1h'] as TimeRange[]).map((t) => (
            <button key={t} onClick={() => setTimeRange(t)} style={pillBtn(timeRange === t)}>{t}</button>
          ))}
          <span style={metricDivider} />
          {/* Verdict filter */}
          {(['all', 'forwarded', 'dropped', 'error'] as VerdictFilter[]).map((v) => (
            <button key={v} onClick={() => setVerdictFilter(v)} style={pillBtn(verdictFilter === v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* === Two-column layout === */}
      <div style={mainLayout}>
        {/* Left: Traffic Map */}
        <div style={trafficCol}>
          <div style={colHeader}>TRAFFIC MAP</div>

          {!hubbleAvailable && (
            <div style={notice}>
              Hubble Relay is not configured. Enable it in your Cilium installation to see live traffic flows.
            </div>
          )}

          {hubbleAvailable && podTraffic.length === 0 && (
            <EmptyState message={`No flows in the last ${timeRange}`} />
          )}

          {podTraffic.map((pt) => (
            <PodCard
              key={pt.pod}
              traffic={pt}
              selected={selectedPod === pt.pod}
              onSelect={() => setSelectedPod(selectedPod === pt.pod ? null : pt.pod)}
            />
          ))}
        </div>

        {/* Right: Policies + Detail */}
        <div style={detailCol}>
          <div style={colHeader}>
            {selectedPod ? `POLICIES FOR ${selectedPod}` : `NETWORK POLICIES (${policies.length})`}
          </div>

          {(selectedPod ? selectedPodPolicies : policies).map((p) => (
            <PolicyCard key={`${p.scope}-${p.name}`} policy={p} />
          ))}

          {policies.length === 0 && (
            <EmptyState message="No network policies found" />
          )}

          {/* Selected pod endpoint detail */}
          {selectedEndpoint && (
            <div style={{ marginTop: spacing[4] }}>
              <div style={colHeader}>ENDPOINT</div>
              <div style={detailCard}>
                <DetailRow label="IP" value={selectedEndpoint.ipv4 || selectedEndpoint.ipv6 || '-'} />
                <DetailRow label="Identity" value={String(selectedEndpoint.identityId || '-')} />
                <DetailRow label="State" value={selectedEndpoint.state || 'unknown'} />
                <DetailRow label="Ingress" value={selectedEndpoint.ingressEnforcement === 'true' ? 'enforced' : 'none'} />
                <DetailRow label="Egress" value={selectedEndpoint.egressEnforcement === 'true' ? 'enforced' : 'none'} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Sub-components ---

const MiniMetric: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <span style={miniMetricStyle}>
    <span style={{ color: color || colors.gray800, fontWeight: fontWeight.semibold, fontFamily: fonts.mono }}>{value}</span>
    <span style={{ color: colors.gray400 }}>{label}</span>
  </span>
);

const PodCard: React.FC<{
  traffic: PodTraffic;
  selected: boolean;
  onSelect: () => void;
}> = ({ traffic, selected, onSelect }) => {
  const hasDrops = traffic.totalDropped > 0;

  return (
    <div
      style={{
        ...podCard,
        borderColor: selected ? colors.orange500 : hasDrops ? colors.red : colors.gray200,
        background: selected ? '#FFF7ED' : hasDrops ? colors.redLight : colors.white,
      }}
      onClick={onSelect}
    >
      {/* Pod header */}
      <div style={podHeader}>
        <span style={podName}>{traffic.pod}</span>
        <div style={{ display: 'flex', gap: spacing[2] }}>
          <span style={{ ...flowCount, color: colors.greenText }}>{traffic.totalForwarded} fwd</span>
          {traffic.totalDropped > 0 && (
            <span style={{ ...flowCount, color: colors.redText }}>{traffic.totalDropped} drop</span>
          )}
        </div>
      </div>

      {/* Connections */}
      {traffic.connections.map((conn, i) => (
        <ConnectionRow key={i} conn={conn} />
      ))}
    </div>
  );
};

const ConnectionRow: React.FC<{ conn: AggregatedConnection }> = ({ conn }) => {
  const total = conn.forwarded + conn.dropped + conn.errors;
  const fwdPct = total > 0 ? (conn.forwarded / total) * 100 : 0;
  const dropPct = total > 0 ? (conn.dropped / total) * 100 : 0;
  const proto = conn.port > 0 ? `${conn.protocol}:${conn.port}` : conn.protocol;
  const arrow = conn.direction === 'outbound' ? '\u2192' : '\u2190';
  const arrowColor = conn.direction === 'outbound' ? colors.orange500 : colors.greenText;

  return (
    <div style={connRow}>
      <span style={{ ...connArrow, color: arrowColor }}>{arrow}</span>
      <span style={connRemote}>{conn.remoteLabel}</span>
      <span style={connProto}>{proto}</span>

      {/* Visual flow bar */}
      <div style={flowBar}>
        {fwdPct > 0 && <div style={{ ...flowBarSegment, width: `${fwdPct}%`, background: colors.greenSolid }} />}
        {dropPct > 0 && <div style={{ ...flowBarSegment, width: `${dropPct}%`, background: colors.redSolid }} />}
      </div>

      <span style={connCount}>{total}</span>

      {/* Drop reason badge */}
      {conn.dropped > 0 && conn.dropReasons.length > 0 && (
        <span style={dropBadge}>{conn.dropReasons[0]}</span>
      )}
    </div>
  );
};

const PolicyCard: React.FC<{ policy: PolicySummary }> = ({ policy }) => {
  const selectorText = policy.endpointSelector
    ? Object.entries(policy.endpointSelector).map(([k, v]) => `${k}=${v}`).join(', ')
    : 'all pods';

  return (
    <div style={{
      ...policyCardStyle,
      borderLeftColor: policy.ownership === 'app' ? colors.greenSolid : colors.gray300,
    }}>
      <div style={policyHeader}>
        <span style={policyName}>{policy.name}</span>
        <div style={{ display: 'flex', gap: spacing[1] }}>
          <Tag variant={policy.scope === 'clusterwide' ? 'orange' : 'gray'}>{policy.scope}</Tag>
          <Tag variant={policy.ownership === 'app' ? 'green' : 'gray'}>
            {policy.ownership === 'app' ? 'This App' : 'Platform'}
          </Tag>
        </div>
      </div>
      <div style={policySelectorRow}>
        <span style={policySelectorLabel}>selects:</span>
        <span style={policySelectorValue}>{selectorText}</span>
      </div>
      <div style={policyRulesRow}>
        {policy.hasIngress && (
          <span style={policyRule}>
            <span style={{ ...ruleSquare, background: colors.greenSolid }} />
            {policy.ingressRuleCount} ingress
          </span>
        )}
        {policy.hasEgress && (
          <span style={policyRule}>
            <span style={{ ...ruleSquare, background: colors.orange400 }} />
            {policy.egressRuleCount} egress
          </span>
        )}
        {!policy.hasIngress && !policy.hasEgress && (
          <span style={{ color: colors.gray400, fontSize: fontSize.xs }}>no rules</span>
        )}
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={detailRow}>
    <span style={detailLabel}>{label}</span>
    <span style={detailValue}>{value}</span>
  </div>
);

// --- Styles ---

const rootPanel: React.CSSProperties = {
  ...panel,
  overflow: 'hidden',
  maxWidth: '100%',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const topStrip: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: spacing[2],
  paddingBottom: spacing[3],
  borderBottom: `1px solid ${colors.gray200}`,
  marginBottom: spacing[3],
};

const summaryRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[3],
  flexWrap: 'wrap',
};

const controlsRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[1],
};

const appLabel: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontWeight: fontWeight.semibold,
  fontSize: fontSize.md,
  color: colors.gray800,
};

const nsMeta: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  color: colors.gray400,
};

const miniMetricStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 3,
  fontSize: fontSize.sm,
  fontFamily: fonts.mono,
};

const metricDivider: React.CSSProperties = {
  width: 1,
  height: 16,
  background: colors.gray200,
  flexShrink: 0,
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: `2px ${spacing[2]}px`,
  border: `1px solid ${active ? colors.orange500 : colors.gray200}`,
  borderRadius: 4,
  background: active ? colors.orange500 : 'transparent',
  color: active ? '#fff' : colors.gray600,
  cursor: 'pointer',
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
  fontFamily: fonts.mono,
  textTransform: 'uppercase' as const,
  lineHeight: '20px',
});

// --- Two-column layout ---

const mainLayout: React.CSSProperties = {
  display: 'flex',
  gap: spacing[4],
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const trafficCol: React.CSSProperties = {
  flex: '1 1 60%',
  overflowY: 'auto',
  minWidth: 0,
};

const detailCol: React.CSSProperties = {
  flex: '1 1 40%',
  overflowY: 'auto',
  minWidth: 0,
  borderLeft: `1px solid ${colors.gray200}`,
  paddingLeft: spacing[4],
};

const colHeader: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  fontFamily: fonts.mono,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color: colors.gray400,
  marginBottom: spacing[3],
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// --- Pod card ---

const podCard: React.CSSProperties = {
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  padding: spacing[3],
  marginBottom: spacing[2],
  cursor: 'pointer',
  transition: 'border-color 100ms',
};

const podHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing[2],
};

const podName: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '60%',
};

const flowCount: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.xs,
  fontWeight: fontWeight.medium,
};

// --- Connection row ---

const connRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  padding: `2px 0`,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
};

const connArrow: React.CSSProperties = {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  width: 14,
  textAlign: 'center',
  flexShrink: 0,
};

const connRemote: React.CSSProperties = {
  color: colors.gray700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  flex: '1 1 auto',
};

const connProto: React.CSSProperties = {
  color: colors.gray400,
  flexShrink: 0,
  width: 64,
  textAlign: 'right',
};

const flowBar: React.CSSProperties = {
  display: 'flex',
  height: 6,
  width: 60,
  background: colors.gray100,
  borderRadius: 1,
  overflow: 'hidden',
  flexShrink: 0,
};

const flowBarSegment: React.CSSProperties = {
  height: '100%',
};

const connCount: React.CSSProperties = {
  color: colors.gray500,
  width: 28,
  textAlign: 'right',
  flexShrink: 0,
};

const dropBadge: React.CSSProperties = {
  fontSize: 10,
  fontFamily: fonts.mono,
  color: colors.redText,
  background: colors.redLight,
  padding: `0 ${spacing[1]}px`,
  borderRadius: 2,
  flexShrink: 0,
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// --- Policy card ---

const policyCardStyle: React.CSSProperties = {
  borderLeft: `3px solid ${colors.gray300}`,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  marginBottom: spacing[2],
  background: colors.gray50,
  borderRadius: `0 4px 4px 0`,
};

const policyHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: spacing[2],
  marginBottom: spacing[1],
};

const policyName: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const policySelectorRow: React.CSSProperties = {
  display: 'flex',
  gap: spacing[1],
  fontSize: fontSize.xs,
  marginBottom: spacing[1],
};

const policySelectorLabel: React.CSSProperties = {
  color: colors.gray400,
  flexShrink: 0,
};

const policySelectorValue: React.CSSProperties = {
  color: colors.gray600,
  fontFamily: fonts.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const policyRulesRow: React.CSSProperties = {
  display: 'flex',
  gap: spacing[3],
  fontSize: fontSize.xs,
  color: colors.gray600,
};

const policyRule: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: fonts.mono,
};

const ruleSquare: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 1,
  flexShrink: 0,
};

// --- Detail panel ---

const detailCard: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  padding: spacing[3],
};

const detailRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: `2px 0`,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
};

const detailLabel: React.CSSProperties = {
  color: colors.gray400,
};

const detailValue: React.CSSProperties = {
  color: colors.gray800,
  fontWeight: fontWeight.medium,
};

const notice: React.CSSProperties = {
  padding: spacing[3],
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  color: colors.gray500,
  fontSize: fontSize.sm,
};

