import * as React from 'react';
import {
  Loading,
  EmptyState,
  Tag,
  Button,
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

// ============================================================
// Graph data model
// ============================================================

interface GraphNode {
  id: string;
  label: string;
  shortLabel: string;
  column: 'left' | 'center' | 'right';
  x: number;
  y: number;
  totalFwd: number;
  totalDrop: number;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  forwarded: number;
  dropped: number;
  errors: number;
  protocol: string;
  port: number;
  dropReasons: string[];
  // Computed path coordinates
  sx: number; sy: number; tx: number; ty: number;
}

const NODE_H = 32;
const NODE_GAP = 10;
const NODE_RADIUS = 4;
const TOP_PAD = 12;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

// ============================================================
// Build graph layout from raw flows
// ============================================================

function buildGraph(flows: FlowSummary[], namespace: string, width: number): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height: number;
} {
  const NODE_W = Math.min(width * 0.24, 180);
  const COL_LEFT = 0;
  const COL_CENTER = (width - NODE_W) / 2;
  const COL_RIGHT = width - NODE_W;

  // Collect unique nodes and aggregate edges.
  const centerSet = new Map<string, { fwd: number; drop: number }>();
  const leftSet = new Map<string, { fwd: number; drop: number }>();
  const rightSet = new Map<string, { fwd: number; drop: number }>();
  const edgeMap = new Map<string, {
    sourceCol: 'left' | 'center';
    sourceLabel: string;
    targetCol: 'center' | 'right';
    targetLabel: string;
    forwarded: number;
    dropped: number;
    errors: number;
    protocol: string;
    port: number;
    dropReasons: string[];
  }>();

  function ensureNode(set: Map<string, { fwd: number; drop: number }>, label: string) {
    if (!set.has(label)) set.set(label, { fwd: 0, drop: 0 });
  }

  function addToNode(set: Map<string, { fwd: number; drop: number }>, label: string, fwd: number, drop: number) {
    const n = set.get(label)!;
    n.fwd += fwd;
    n.drop += drop;
  }

  for (const f of flows) {
    const isSourceLocal = f.sourceNamespace === namespace && f.sourcePod;
    const isDestLocal = f.destNamespace === namespace && f.destPod;
    const fwd = f.verdict === 'FORWARDED' ? 1 : 0;
    const drop = f.verdict === 'DROPPED' ? 1 : 0;

    if (isSourceLocal && !isDestLocal) {
      // Outbound: center → right
      const centerLabel = f.sourcePod;
      const rightLabel = f.destPod
        ? (f.destNamespace === namespace ? f.destPod : `${f.destNamespace}/${f.destPod}`)
        : f.destDNS || f.destIP || 'unknown';
      const proto = f.protocol || '';
      const port = f.destPort || 0;

      ensureNode(centerSet, centerLabel);
      addToNode(centerSet, centerLabel, fwd, drop);
      ensureNode(rightSet, rightLabel);
      addToNode(rightSet, rightLabel, fwd, drop);

      const ek = `c:${centerLabel}|r:${rightLabel}|${proto}:${port}`;
      if (!edgeMap.has(ek)) {
        edgeMap.set(ek, { sourceCol: 'center', sourceLabel: centerLabel, targetCol: 'right', targetLabel: rightLabel, forwarded: 0, dropped: 0, errors: 0, protocol: proto, port, dropReasons: [] });
      }
      const e = edgeMap.get(ek)!;
      e.forwarded += fwd;
      e.dropped += drop;
      if (f.verdict === 'ERROR') e.errors++;
      if (f.dropReason && !e.dropReasons.includes(f.dropReason)) e.dropReasons.push(f.dropReason);

    } else if (isDestLocal && !isSourceLocal) {
      // Inbound: left → center
      const centerLabel = f.destPod;
      const leftLabel = f.sourcePod
        ? (f.sourceNamespace === namespace ? f.sourcePod : `${f.sourceNamespace}/${f.sourcePod}`)
        : f.sourceIP || 'unknown';
      const proto = f.protocol || '';
      const port = f.destPort || 0;

      ensureNode(centerSet, centerLabel);
      addToNode(centerSet, centerLabel, fwd, drop);
      ensureNode(leftSet, leftLabel);
      addToNode(leftSet, leftLabel, fwd, drop);

      const ek = `l:${leftLabel}|c:${centerLabel}|${proto}:${port}`;
      if (!edgeMap.has(ek)) {
        edgeMap.set(ek, { sourceCol: 'left', sourceLabel: leftLabel, targetCol: 'center', targetLabel: centerLabel, forwarded: 0, dropped: 0, errors: 0, protocol: proto, port, dropReasons: [] });
      }
      const e = edgeMap.get(ek)!;
      e.forwarded += fwd;
      e.dropped += drop;
      if (f.verdict === 'ERROR') e.errors++;
      if (f.dropReason && !e.dropReasons.includes(f.dropReason)) e.dropReasons.push(f.dropReason);

    } else if (isSourceLocal && isDestLocal) {
      // Internal: center → center (show as center pod outbound to another center pod)
      const srcLabel = f.sourcePod;
      const dstLabel = f.destPod;
      ensureNode(centerSet, srcLabel);
      addToNode(centerSet, srcLabel, fwd, drop);
      ensureNode(centerSet, dstLabel);
      addToNode(centerSet, dstLabel, fwd, drop);
      // Skip drawing internal edges for clarity (they connect same column).
    }
  }

  // Position nodes in columns.
  const leftLabels = Array.from(leftSet.keys());
  const centerLabels = Array.from(centerSet.keys());
  const rightLabels = Array.from(rightSet.keys());

  const maxCol = Math.max(leftLabels.length, centerLabels.length, rightLabels.length, 1);
  const totalH = maxCol * (NODE_H + NODE_GAP) - NODE_GAP + TOP_PAD * 2;

  function positionColumn(labels: string[], x: number, data: Map<string, { fwd: number; drop: number }>, col: 'left' | 'center' | 'right'): GraphNode[] {
    const colH = labels.length * (NODE_H + NODE_GAP) - NODE_GAP;
    const startY = TOP_PAD + (totalH - TOP_PAD * 2 - colH) / 2;
    const maxChars = col === 'center' ? 20 : 18;

    return labels.map((label, i) => {
      const d = data.get(label)!;
      return {
        id: `${col}:${label}`,
        label,
        shortLabel: truncate(label, maxChars),
        column: col,
        x,
        y: startY + i * (NODE_H + NODE_GAP),
        totalFwd: d.fwd,
        totalDrop: d.drop,
      };
    });
  }

  const nodes: GraphNode[] = [
    ...positionColumn(leftLabels, COL_LEFT, leftSet, 'left'),
    ...positionColumn(centerLabels, COL_CENTER, centerSet, 'center'),
    ...positionColumn(rightLabels, COL_RIGHT, rightSet, 'right'),
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build edges with coordinates.
  const edges: GraphEdge[] = [];
  for (const [ek, e] of edgeMap) {
    const srcId = e.sourceCol === 'left' ? `left:${e.sourceLabel}` : `center:${e.sourceLabel}`;
    const tgtId = e.targetCol === 'right' ? `right:${e.targetLabel}` : `center:${e.targetLabel}`;
    const src = nodeMap.get(srcId);
    const tgt = nodeMap.get(tgtId);
    if (!src || !tgt) continue;

    edges.push({
      id: ek,
      sourceId: srcId,
      targetId: tgtId,
      forwarded: e.forwarded,
      dropped: e.dropped,
      errors: e.errors,
      protocol: e.protocol,
      port: e.port,
      dropReasons: e.dropReasons,
      sx: src.x + NODE_W,
      sy: src.y + NODE_H / 2,
      tx: tgt.x,
      ty: tgt.y + NODE_H / 2,
    });
  }

  return { nodes, edges, height: Math.max(totalH, 120) };
}

// ============================================================
// SVG sub-components
// ============================================================

const EdgePath: React.FC<{
  edge: GraphEdge;
  highlighted: boolean;
  dimmed: boolean;
  onHover: (edge: GraphEdge | null) => void;
}> = ({ edge, highlighted, dimmed, onHover }) => {
  const total = edge.forwarded + edge.dropped + edge.errors;
  const thickness = Math.max(1.5, Math.min(5, Math.sqrt(total) * 1.2));
  const cpx = Math.abs(edge.tx - edge.sx) * 0.4;

  const path = `M ${edge.sx} ${edge.sy} C ${edge.sx + cpx} ${edge.sy}, ${edge.tx - cpx} ${edge.ty}, ${edge.tx} ${edge.ty}`;

  let strokeColor: string;
  if (edge.dropped > 0 && edge.forwarded === 0) {
    strokeColor = colors.red;
  } else if (edge.dropped > 0) {
    strokeColor = colors.yellowSolid;
  } else {
    strokeColor = colors.greenSolid;
  }

  const opacity = dimmed ? 0.15 : highlighted ? 1 : 0.6;
  const dashArray = edge.dropped > 0 && edge.forwarded === 0 ? '6 3' : undefined;

  return (
    <g
      onMouseEnter={() => onHover(edge)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      {/* Invisible wide path for easier hover target */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={thickness}
        strokeDasharray={dashArray}
        opacity={opacity}
      />
      {/* Drop count badge at midpoint */}
      {edge.dropped > 0 && highlighted && (
        <DropBadgeSVG
          x={(edge.sx + edge.tx) / 2}
          y={(edge.sy + edge.ty) / 2 - 10}
          count={edge.dropped}
          reason={edge.dropReasons[0]}
        />
      )}
    </g>
  );
};

const DropBadgeSVG: React.FC<{ x: number; y: number; count: number; reason?: string }> = ({ x, y, count, reason }) => {
  const text = reason ? `${count} drop: ${reason}` : `${count} drop`;
  const textLen = text.length * 5.5 + 12;

  return (
    <g>
      <rect x={x - textLen / 2} y={y - 8} width={textLen} height={16} rx={2} fill={colors.redLight} stroke={colors.red} strokeWidth={0.5} />
      <text x={x} y={y + 3} textAnchor="middle" fontSize={10} fontFamily={fonts.mono} fill={colors.redText}>{text}</text>
    </g>
  );
};

const NodeRect: React.FC<{
  node: GraphNode;
  selected: boolean;
  dimmed: boolean;
  nodeWidth: number;
  onClick: () => void;
}> = ({ node, selected, dimmed, nodeWidth, onClick }) => {
  const hasDrop = node.totalDrop > 0;
  const borderColor = selected ? colors.orange500 : hasDrop ? colors.red : colors.gray300;
  const bgColor = selected ? '#FFF7ED' : hasDrop ? colors.redLight : colors.white;
  const textColor = dimmed ? colors.gray300 : colors.gray800;
  const opacity = dimmed ? 0.5 : 1;

  // Count badge
  const countText = hasDrop ? `${node.totalFwd}/${node.totalDrop}` : String(node.totalFwd);

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }} opacity={opacity}>
      <rect
        x={node.x}
        y={node.y}
        width={nodeWidth}
        height={NODE_H}
        rx={NODE_RADIUS}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={selected ? 2 : 1}
      />
      {/* Label */}
      <text
        x={node.x + 8}
        y={node.y + NODE_H / 2 + 4}
        fontSize={11}
        fontFamily={fonts.mono}
        fontWeight={node.column === 'center' ? 600 : 400}
        fill={textColor}
      >
        {node.shortLabel}
      </text>
      {/* Flow count badge on the right side */}
      <text
        x={node.x + nodeWidth - 8}
        y={node.y + NODE_H / 2 + 4}
        textAnchor="end"
        fontSize={10}
        fontFamily={fonts.mono}
        fill={hasDrop ? colors.redText : colors.greenText}
      >
        {countText}
      </text>
      {/* Column indicator line on center pods */}
      {node.column === 'center' && (
        <rect
          x={node.x}
          y={node.y}
          width={3}
          height={NODE_H}
          rx={NODE_RADIUS}
          fill={colors.orange500}
        />
      )}
    </g>
  );
};

// ============================================================
// Edge tooltip
// ============================================================

const EdgeTooltip: React.FC<{ edge: GraphEdge; containerRect: DOMRect | null }> = ({ edge, containerRect }) => {
  if (!containerRect) return null;
  const x = (edge.sx + edge.tx) / 2;
  const y = Math.min(edge.sy, edge.ty) - 4;
  const proto = edge.port > 0 ? `${edge.protocol}:${edge.port}` : edge.protocol;

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: 'translate(-50%, -100%)',
      background: colors.gray800,
      color: colors.white,
      padding: `${spacing[1]}px ${spacing[2]}px`,
      borderRadius: 4,
      fontSize: fontSize.xs,
      fontFamily: fonts.mono,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <span>{proto}</span>
      <span style={{ color: colors.greenSolid, marginLeft: spacing[2] }}>{edge.forwarded} fwd</span>
      {edge.dropped > 0 && (
        <span style={{ color: colors.redSolid, marginLeft: spacing[2] }}>{edge.dropped} drop</span>
      )}
      {edge.dropReasons.length > 0 && (
        <span style={{ color: colors.red, marginLeft: spacing[2] }}>({edge.dropReasons[0]})</span>
      )}
    </div>
  );
};

// ============================================================
// Main component
// ============================================================

const REFRESH_INTERVAL = 30_000;

export const AppNetworkingView: React.FC<{ application: any; tree?: any }> = ({ application, tree }) => {
  const [policies, setPolicies] = React.useState<PolicySummary[]>([]);
  const [endpoints, setEndpoints] = React.useState<EndpointSummary[]>([]);
  const [flowsResponse, setFlowsResponse] = React.useState<FlowsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = React.useState<GraphEdge | null>(null);
  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [timeRange, setTimeRange] = React.useState<TimeRange>('5m');

  const graphContainerRef = React.useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = React.useState(800);

  const namespace = application?.spec?.destination?.namespace || '';
  const appName = application?.metadata?.name || '';
  const appNamespace = application?.metadata?.namespace || 'argocd';
  const project = application?.spec?.project || 'default';

  const resourceRefs = React.useMemo<ResourceRef[]>(() => {
    if (!tree?.nodes) return [];
    return tree.nodes
      .filter((n: any) => n.namespace === namespace || !n.namespace)
      .map((n: any) => ({ group: n.group || '', kind: n.kind, namespace: n.namespace || '', name: n.name }));
  }, [tree, namespace]);

  // Measure graph container.
  React.useEffect(() => {
    if (!graphContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGraphWidth(entry.contentRect.width);
      }
    });
    observer.observe(graphContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const fetchAll = React.useCallback(() => {
    if (!namespace) return;
    const policiesP = fetchPoliciesWithOwnership(namespace, resourceRefs, appNamespace, appName, project).catch(() => [] as PolicySummary[]);
    const endpointsP = fetchEndpoints(namespace, appNamespace, appName, project).catch(() => [] as EndpointSummary[]);
    const flowsP = fetchFlows(namespace, appNamespace, appName, project, timeRange, 500, verdictFilter).catch(() => ({ flows: [], hubble: false } as FlowsResponse));

    Promise.all([policiesP, endpointsP, flowsP])
      .then(([pol, ep, fl]) => { setPolicies(pol); setEndpoints(ep); setFlowsResponse(fl); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, resourceRefs, timeRange, verdictFilter]);

  React.useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);
  React.useEffect(() => { const i = setInterval(fetchAll, REFRESH_INTERVAL); return () => clearInterval(i); }, [fetchAll]);

  // All hooks must be above early returns to satisfy rules of hooks.
  const flows = flowsResponse?.flows || [];
  const flowSummary = flowsResponse?.summary;
  const hubbleAvailable = flowsResponse?.hubble ?? false;

  const graph = React.useMemo(() => buildGraph(flows, namespace, graphWidth), [flows, namespace, graphWidth]);
  const nodeWidth = Math.min(graphWidth * 0.24, 180);

  const selectedPodName = selectedNode?.startsWith('center:') ? selectedNode.slice(7) : null;
  const selectedEndpoint = selectedPodName ? endpoints.find((ep) => ep.name === selectedPodName) : null;
  const displayPolicies = React.useMemo(() => {
    if (!selectedPodName) return policies;
    const ep = endpoints.find((e) => e.name === selectedPodName);
    if (!ep?.labels) return policies;
    return policies.filter((p) => {
      if (!p.endpointSelector) return true;
      return Object.entries(p.endpointSelector).every(([k, v]) => ep.labels && ep.labels[`k8s:${k}`] === v);
    });
  }, [selectedPodName, endpoints, policies]);

  const connectedEdgeIds = React.useMemo(() => {
    if (!selectedNode) return new Set<string>();
    return new Set(graph.edges.filter((e) => e.sourceId === selectedNode || e.targetId === selectedNode).map((e) => e.id));
  }, [selectedNode, graph.edges]);

  if (loading) return <div style={panel}><Loading /></div>;
  if (error) {
    return (
      <div style={panel}>
        <div style={{ color: colors.redText, marginBottom: spacing[2] }}>Failed to load: {error}</div>
        <Button onClick={() => { setLoading(true); fetchAll(); }}>Retry</Button>
      </div>
    );
  }

  return (
    <div style={rootPanel}>
      {/* === Top strip === */}
      <div style={topStrip}>
        <div style={summaryRow}>
          <span style={appLabelStyle}>{appName}</span>
          <span style={nsStyle}>{namespace}</span>
          {hubbleAvailable && flowSummary && (
            <>
              <Divider />
              <Metric label="flows" value={flowSummary.total} />
              <Metric label="fwd" value={flowSummary.forwarded} color={colors.greenText} />
              <Metric label="drop" value={flowSummary.dropped} color={flowSummary.dropped > 0 ? colors.redText : undefined} />
              <Metric label="err" value={flowSummary.error} color={flowSummary.error > 0 ? colors.yellowText : undefined} />
            </>
          )}
        </div>
        <div style={controlsRow}>
          {(['5m', '15m', '1h'] as TimeRange[]).map((t) => (
            <button key={t} onClick={() => setTimeRange(t)} style={pill(timeRange === t)}>{t}</button>
          ))}
          <Divider />
          {(['all', 'forwarded', 'dropped', 'error'] as VerdictFilter[]).map((v) => (
            <button key={v} onClick={() => setVerdictFilter(v)} style={pill(verdictFilter === v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* === Main content === */}
      <div style={mainContent}>
        {/* Graph area */}
        <div style={graphCol} ref={graphContainerRef}>
          {!hubbleAvailable && (
            <div style={noticeStyle}>Hubble Relay not configured. Enable it to see traffic flows.</div>
          )}

          {hubbleAvailable && graph.nodes.length === 0 && (
            <EmptyState message={`No flows in the last ${timeRange}`} />
          )}

          {hubbleAvailable && graph.nodes.length > 0 && (
            <div style={{ position: 'relative' }}>
              {/* Column labels */}
              <div style={colLabelsRow}>
                <span style={colLabel}>INBOUND</span>
                <span style={{ ...colLabel, color: colors.orange500 }}>APP PODS</span>
                <span style={colLabel}>OUTBOUND</span>
              </div>

              <svg
                width={graphWidth}
                height={graph.height}
                style={{ display: 'block' }}
                onClick={(e) => { if (e.target === e.currentTarget) setSelectedNode(null); }}
              >
                {/* Edges */}
                {graph.edges.map((edge) => {
                  const isHighlighted = !selectedNode || connectedEdgeIds.has(edge.id);
                  const isDimmed = !!selectedNode && !connectedEdgeIds.has(edge.id);
                  return (
                    <EdgePath
                      key={edge.id}
                      edge={edge}
                      highlighted={isHighlighted || hoveredEdge?.id === edge.id}
                      dimmed={isDimmed}
                      onHover={setHoveredEdge}
                    />
                  );
                })}
                {/* Nodes */}
                {graph.nodes.map((node) => {
                  const isDimmed = !!selectedNode && selectedNode !== node.id && !connectedEdgeIds.has(node.id)
                    && !graph.edges.some((e) => (e.sourceId === selectedNode || e.targetId === selectedNode) && (e.sourceId === node.id || e.targetId === node.id));
                  return (
                    <NodeRect
                      key={node.id}
                      node={node}
                      selected={selectedNode === node.id}
                      dimmed={isDimmed}
                      nodeWidth={nodeWidth}
                      onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                    />
                  );
                })}
              </svg>

              {/* Edge tooltip */}
              {hoveredEdge && (
                <EdgeTooltip edge={hoveredEdge} containerRect={graphContainerRef.current?.getBoundingClientRect() || null} />
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div style={detailPanel}>
          {/* Policies */}
          <div style={panelSection}>
            <div style={panelHeader}>
              {selectedPodName ? `POLICIES \u2014 ${truncate(selectedPodName, 20)}` : `POLICIES (${policies.length})`}
            </div>
            {displayPolicies.length === 0 && <div style={emptyHint}>No policies</div>}
            {displayPolicies.map((p) => (
              <PolicyCard key={`${p.scope}-${p.name}`} policy={p} />
            ))}
          </div>

          {/* Endpoint detail */}
          {selectedEndpoint && (
            <div style={panelSection}>
              <div style={panelHeader}>ENDPOINT</div>
              <div style={kvGrid}>
                <KV label="IP" value={selectedEndpoint.ipv4 || selectedEndpoint.ipv6 || '-'} />
                <KV label="Identity" value={String(selectedEndpoint.identityId || '-')} />
                <KV label="State" value={selectedEndpoint.state || '?'} />
                <KV label="Ingress" value={selectedEndpoint.ingressEnforcement === 'true' ? 'enforced' : 'none'} />
                <KV label="Egress" value={selectedEndpoint.egressEnforcement === 'true' ? 'enforced' : 'none'} />
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{ ...panelSection, marginTop: 'auto' }}>
            <div style={panelHeader}>LEGEND</div>
            <div style={legendGrid}>
              <LegendItem color={colors.greenSolid} label="Forwarded" />
              <LegendItem color={colors.red} label="Dropped" dashed />
              <LegendItem color={colors.yellowSolid} label="Mixed" />
              <LegendItem color={colors.orange500} label="App pod" square />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Small shared sub-components
// ============================================================

const Metric: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, fontSize: fontSize.sm, fontFamily: fonts.mono }}>
    <span style={{ color: color || colors.gray800, fontWeight: fontWeight.semibold }}>{value}</span>
    <span style={{ color: colors.gray400 }}>{label}</span>
  </span>
);

const Divider: React.FC = () => <span style={{ width: 1, height: 16, background: colors.gray200, flexShrink: 0 }} />;

const PolicyCard: React.FC<{ policy: PolicySummary }> = ({ policy }) => {
  const sel = policy.endpointSelector
    ? Object.entries(policy.endpointSelector).map(([k, v]) => `${k}=${v}`).join(', ')
    : 'all pods';

  return (
    <div style={{ ...policyCard, borderLeftColor: policy.ownership === 'app' ? colors.greenSolid : colors.gray300 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <span style={policyNameStyle}>{policy.name}</span>
        <Tag variant={policy.ownership === 'app' ? 'green' : 'gray'}>
          {policy.ownership === 'app' ? 'App' : 'Platform'}
        </Tag>
      </div>
      <div style={{ fontSize: 10, color: colors.gray400, fontFamily: fonts.mono, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
        {sel}
        {policy.hasIngress && <span style={{ color: colors.greenText, marginLeft: spacing[2] }}>{policy.ingressRuleCount}in</span>}
        {policy.hasEgress && <span style={{ color: colors.orange500, marginLeft: spacing[2] }}>{policy.egressRuleCount}eg</span>}
      </div>
    </div>
  );
};

const KV: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <>
    <span style={{ color: colors.gray400, fontSize: fontSize.xs, fontFamily: fonts.mono }}>{label}</span>
    <span style={{ color: colors.gray800, fontSize: fontSize.xs, fontFamily: fonts.mono, fontWeight: fontWeight.medium }}>{value}</span>
  </>
);

const LegendItem: React.FC<{ color: string; label: string; dashed?: boolean; square?: boolean }> = ({ color, label, dashed, square }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: colors.gray500 }}>
    {square ? (
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
    ) : (
      <svg width={20} height={6}>
        <line x1={0} y1={3} x2={20} y2={3} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '4 2' : undefined} />
      </svg>
    )}
    <span>{label}</span>
  </div>
);

// ============================================================
// Styles
// ============================================================

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
  flexShrink: 0,
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

const appLabelStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontWeight: fontWeight.semibold,
  fontSize: fontSize.md,
  color: colors.gray800,
};

const nsStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.sm,
  color: colors.gray400,
};

const pill = (active: boolean): React.CSSProperties => ({
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

const mainContent: React.CSSProperties = {
  display: 'flex',
  gap: spacing[4],
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const graphCol: React.CSSProperties = {
  flex: '1 1 65%',
  overflowY: 'auto',
  overflowX: 'hidden',
  minWidth: 0,
};

const detailPanel: React.CSSProperties = {
  flex: '0 0 260px',
  overflowY: 'auto',
  minWidth: 0,
  borderLeft: `1px solid ${colors.gray200}`,
  paddingLeft: spacing[3],
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[3],
};

const colLabelsRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  paddingBottom: spacing[2],
};

const colLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: fonts.mono,
  fontWeight: fontWeight.semibold,
  letterSpacing: '0.5px',
  color: colors.gray400,
  textTransform: 'uppercase' as const,
  width: '24%',
  textAlign: 'center',
};

const panelSection: React.CSSProperties = {};

const panelHeader: React.CSSProperties = {
  fontSize: 10,
  fontFamily: fonts.mono,
  fontWeight: fontWeight.semibold,
  letterSpacing: '0.5px',
  color: colors.gray400,
  textTransform: 'uppercase' as const,
  marginBottom: spacing[2],
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const policyCard: React.CSSProperties = {
  borderLeft: `3px solid ${colors.gray300}`,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  marginBottom: spacing[1],
  background: colors.gray50,
  borderRadius: `0 4px 4px 0`,
};

const policyNameStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  color: colors.gray800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const kvGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: `2px ${spacing[2]}px`,
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  padding: spacing[2],
};

const legendGrid: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const noticeStyle: React.CSSProperties = {
  padding: spacing[3],
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: 4,
  color: colors.gray500,
  fontSize: fontSize.sm,
};

const emptyHint: React.CSSProperties = {
  color: colors.gray400,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
};
