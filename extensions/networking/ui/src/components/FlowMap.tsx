import * as React from 'react';
import { EmptyState, colors, fonts, fontSize, fontWeight, spacing } from '@argoplane/shared';
import { FlowSummary } from '../types';

// Three-column flow map: callers -> the app's workloads -> callees.
// Hand-rolled SVG (no layout library): the middle column is fixed by the app
// namespace, so positions stay put across refreshes, unlike a force layout.
// ponytail: built from the flows the table already fetched (max 500), so
// counts are a sample. Move aggregation into the backend if that matters.

interface MapNode {
  id: string;
  label: string;
  sub: string;
  filter: string;
  col: 0 | 1 | 2;
  total: number;
  dropped: number;
  ports: Set<string>;
}

interface MapEdge {
  src: string;
  dst: string;
  forwarded: number;
  dropped: number;
  errors: number;
  ports: Set<string>;
}

interface Endpoint { id: string; label: string; sub: string; filter: string; center: boolean }

const MAX_OUTER = 15;
const MAX_DEPTH = 3; // sub-columns for calls between the app's own workloads
const NODE_W = 200;
const NODE_H = 36;
const GAP = 8;
const COL_GAP = 72;
const HEAD_H = 24;
const LOOP = 40; // how far same-column edges bulge to the right
const LANE = 16; // room above/below the columns for edges that skip a column

// Strip ReplicaSet/DaemonSet pod suffixes when Hubble did not resolve a workload.
function podWorkload(pod: string): string {
  return pod.replace(/-[a-z0-9]{6,10}-[a-z0-9]{5}$/, '').replace(/-[a-z0-9]{5}$/, '');
}

function endpoint(ns: string, pod: string, workload: string | undefined, identity: string | undefined, ip: string | undefined, dns: string | undefined, appNs: string): Endpoint {
  if (pod) {
    const name = workload || podWorkload(pod);
    return { id: `${ns}/${name}`, label: name, sub: ns === appNs ? '' : ns, filter: name, center: ns === appNs };
  }
  if (identity && identity !== 'world') {
    return { id: `reserved:${identity}`, label: identity, sub: 'reserved', filter: ip || identity, center: false };
  }
  const name = dns || ip || 'unknown';
  return { id: `ext:${name}`, label: name, sub: identity === 'world' || dns ? 'world' : 'ip', filter: name, center: false };
}

function buildGraph(flows: FlowSummary[], appNs: string): { nodes: Map<string, MapNode>; edges: MapEdge[] } {
  const nodes = new Map<string, MapNode>();
  const edges = new Map<string, MapEdge>();

  const node = (e: Endpoint, col: 0 | 1 | 2): MapNode => {
    const id = e.center ? e.id : `${col}:${e.id}`; // outer peers may appear on both sides
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: e.label, sub: e.sub, filter: e.filter, col, total: 0, dropped: 0, ports: new Set() };
      nodes.set(id, n);
    }
    return n;
  };

  for (const f of flows) {
    if (f.isReply) continue;
    const s = endpoint(f.sourceNamespace, f.sourcePod, f.sourceWorkload, f.sourceIdentity, f.sourceIP, undefined, appNs);
    const d = endpoint(f.destNamespace, f.destPod, f.destWorkload, f.destIdentity, f.destIP, f.destDNS, appNs);
    if (!s.center && !d.center) continue;
    const src = node(s, s.center ? 1 : 0);
    const dst = node(d, d.center ? 1 : 2);
    const port = f.destPort ? `${f.protocol}/${f.destPort}` : f.protocol;
    const key = `${src.id}|${dst.id}`;
    let e = edges.get(key);
    if (!e) {
      e = { src: src.id, dst: dst.id, forwarded: 0, dropped: 0, errors: 0, ports: new Set() };
      edges.set(key, e);
    }
    if (f.verdict === 'FORWARDED') e.forwarded++;
    else if (f.verdict === 'DROPPED') e.dropped++;
    else e.errors++;
    e.ports.add(port);
    dst.ports.add(port);
    for (const n of [src, dst]) {
      n.total++;
      if (f.verdict === 'DROPPED') n.dropped++;
    }
  }
  return { nodes, edges: Array.from(edges.values()) };
}

/** Collapse the long tail of an outer column into a single "+N more" node. */
function capColumn(col: MapNode[], colIdx: 0 | 2, nodes: Map<string, MapNode>, edges: MapEdge[]): MapNode[] {
  if (col.length <= MAX_OUTER) return col;
  const keep = col.slice(0, MAX_OUTER - 1);
  const rest = col.slice(MAX_OUTER - 1);
  const more: MapNode = { id: `${colIdx}:more`, label: `+${rest.length} more`, sub: '', filter: '', col: colIdx, total: 0, dropped: 0, ports: new Set() };
  const restIds = new Set(rest.map((n) => n.id));
  for (const n of rest) { more.total += n.total; more.dropped += n.dropped; }
  for (const e of edges) {
    if (restIds.has(e.src)) e.src = more.id;
    if (restIds.has(e.dst)) e.dst = more.id;
  }
  nodes.set(more.id, more);
  return [...keep, more];
}

/** Merge edges that point at the same node pair after collapsing. */
function mergeEdges(edges: MapEdge[]): MapEdge[] {
  const out = new Map<string, MapEdge>();
  for (const e of edges) {
    const key = `${e.src}|${e.dst}`;
    const m = out.get(key);
    if (!m) { out.set(key, { ...e, ports: new Set(e.ports) }); continue; }
    m.forwarded += e.forwarded; m.dropped += e.dropped; m.errors += e.errors;
    e.ports.forEach((p) => m.ports.add(p));
  }
  return Array.from(out.values());
}

function edgeColor(e: MapEdge): string {
  if (e.dropped > 0) return colors.redText;
  if (e.errors > 0) return colors.yellowText;
  return colors.greenText;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function portList(ports: Set<string>): string {
  const list = Array.from(ports).sort();
  return list.length > 3 ? `${list.slice(0, 3).join(' ')} +${list.length - 3}` : list.join(' ');
}

export const FlowMap: React.FC<{ flows: FlowSummary[]; namespace: string; onFilter: (value: string) => void }> = ({ flows, namespace, onFilter }) => {
  const layout = React.useMemo(() => {
    const { nodes, edges } = buildGraph(flows, namespace);
    const byTraffic = (a: MapNode, b: MapNode) => b.total - a.total || a.label.localeCompare(b.label);
    const app = Array.from(nodes.values()).filter((n) => n.col === 1).sort(byTraffic);

    // Calls between app workloads push the callee one sub-column right, so a
    // chain like frontend -> cart -> checkout reads left to right. Bounded
    // passes keep cycles from looping forever.
    const depth = new Map(app.map((n) => [n.id, 0]));
    for (let pass = 0; pass < MAX_DEPTH; pass++) {
      for (const e of edges) {
        const d = depth.get(e.src);
        if (d !== undefined && depth.has(e.dst) && e.src !== e.dst) {
          depth.set(e.dst, Math.min(Math.max(depth.get(e.dst)!, d + 1), MAX_DEPTH - 1));
        }
      }
    }
    const subCols = Math.max(...Array.from(depth.values()), 0) + 1;
    const middle: MapNode[][] = Array.from({ length: subCols }, (_, i) => app.filter((n) => depth.get(n.id) === i));
    const appIndex = new Map(app.map((n, i) => [n.id, i]));

    // Order outer nodes by the mean position of the app workloads they touch,
    // so edges cross as little as possible.
    const barycenter = (n: MapNode) => {
      const idx = edges.filter((e) => e.src === n.id || e.dst === n.id)
        .map((e) => appIndex.get(e.src === n.id ? e.dst : e.src) ?? 0);
      return idx.reduce((a, b) => a + b, 0) / Math.max(idx.length, 1);
    };
    const outer = (col: 0 | 2) => {
      const ranked = Array.from(nodes.values()).filter((n) => n.col === col).sort(byTraffic);
      return capColumn(ranked, col, nodes, edges).sort((a, b) => barycenter(a) - barycenter(b));
    };
    const cols = [outer(0), ...middle, outer(2)];
    const merged = mergeEdges(edges);

    const colX = cols.map((_, i) => i * (NODE_W + COL_GAP));
    const width = colX[colX.length - 1] + NODE_W + LOOP + GAP;
    const height = Math.max(NODE_H, ...cols.map((c) => c.length * (NODE_H + GAP) - GAP));
    const pos = new Map<string, { x: number; y: number; ci: number }>();
    const colTop: number[] = [];
    const colBottom: number[] = [];
    cols.forEach((c, ci) => {
      const offset = HEAD_H + LANE + (height - (c.length * (NODE_H + GAP) - GAP)) / 2;
      colTop[ci] = offset;
      colBottom[ci] = offset + c.length * (NODE_H + GAP) - GAP;
      c.forEach((n, i) => pos.set(n.id, { x: colX[ci], y: offset + i * (NODE_H + GAP), ci }));
    });
    const heads = cols.map((_, i) => i === 0 ? 'Callers' : i === cols.length - 1 ? 'Callees' : i === 1 ? `App (${namespace})` : '');
    return { cols, edges: merged, pos, width, height: HEAD_H + height + 2 * LANE, nodes, colX, heads, colTop, colBottom };
  }, [flows, namespace]);

  if (layout.cols.length < 3 || layout.cols[1].length === 0) {
    return <EmptyState message="No flows to map in this time range" />;
  }

  const { cols, edges, pos, width, height, nodes, colX, heads, colTop, colBottom } = layout;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', maxWidth: width, minWidth: width * 0.75 }} role="img" aria-label="Network flow map">
        {heads.map((h, i) => h && (
          <text key={h} x={colX[i] + NODE_W / 2} y={12} textAnchor="middle" fontFamily={fonts.mono} fontSize={fontSize.xs}
            fontWeight={fontWeight.semibold} fill={colors.gray500} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</text>
        ))}
        {edges.map((e) => {
          const a = pos.get(e.src);
          const b = pos.get(e.dst);
          if (!a || !b) return null;
          const total = e.forwarded + e.dropped + e.errors;
          const backward = b.x <= a.x; // same sub-column, or a call cycle
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = backward ? b.x + NODE_W : b.x;
          const y2 = b.y + NODE_H / 2;
          let d: string;
          if (backward) {
            d = `M ${x1} ${y1} C ${x1 + LOOP} ${y1}, ${x2 + LOOP} ${y2}, ${x2} ${y2}`;
          } else if (b.ci - a.ci > 1) {
            // Skips a column: run along a lane above or below the skipped
            // columns instead of passing under their nodes.
            const skipped = Array.from({ length: b.ci - a.ci - 1 }, (_, k) => a.ci + 1 + k);
            const above = y1 + y2 < colTop[a.ci + 1] + colBottom[a.ci + 1];
            const lane = above
              ? Math.min(...skipped.map((c) => colTop[c])) - LANE / 2
              : Math.max(...skipped.map((c) => colBottom[c])) + LANE / 2;
            const xs = colX[a.ci + 1] - COL_GAP / 2;
            const xe = colX[b.ci - 1] + NODE_W + COL_GAP / 2;
            d = `M ${x1} ${y1} C ${(x1 + xs) / 2} ${y1}, ${(x1 + xs) / 2} ${lane}, ${xs} ${lane} L ${xe} ${lane} C ${(xe + x2) / 2} ${lane}, ${(xe + x2) / 2} ${y2}, ${x2} ${y2}`;
          } else {
            d = `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
          }
          const title = `${nodes.get(e.src)?.label} → ${nodes.get(e.dst)?.label}\n${portList(e.ports)}\nforwarded ${e.forwarded}  dropped ${e.dropped}  error ${e.errors}`;
          return (
            <path key={`${e.src}|${e.dst}`} d={d} fill="none" stroke={edgeColor(e)} strokeWidth={total >= 50 ? 2 : 1}
              strokeDasharray={e.dropped > 0 && e.forwarded === 0 ? '4 3' : undefined} style={{ cursor: 'pointer' }}
              onClick={() => onFilter(nodes.get(e.dst)?.filter || '')}>
              <title>{title}</title>
            </path>
          );
        })}
        {cols.flat().map((n) => {
          const p = pos.get(n.id)!;
          const status = n.dropped > 0 ? colors.redText : colors.greenText;
          const second = [n.sub, n.col !== 0 ? portList(n.ports) : ''].filter(Boolean).join(' · ');
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: n.filter ? 'pointer' : 'default' }}
              onClick={() => n.filter && onFilter(n.filter)}>
              <title>{`${n.label}${n.sub ? ` (${n.sub})` : ''}\n${n.total} flows, ${n.dropped} dropped`}</title>
              <rect width={NODE_W} height={NODE_H} rx={2} fill={n.col === 1 ? colors.orange50 : colors.white}
                stroke={n.dropped > 0 ? colors.red : n.col === 1 ? colors.orange300 : colors.gray200} />
              <rect x={8} y={8} width={8} height={8} rx={1} fill={status} />
              <text x={24} y={15} fontFamily={fonts.mono} fontSize={fontSize.xs} fontWeight={fontWeight.semibold} fill={colors.gray800}>{truncate(n.label, 25)}</text>
              <text x={24} y={29} fontFamily={fonts.mono} fontSize={10} fill={colors.gray500}>{truncate(second, 28)}</text>
              {n.dropped > 0 && (
                <text x={NODE_W - 8} y={15} textAnchor="end" fontFamily={fonts.mono} fontSize={fontSize.xs} fontWeight={fontWeight.semibold} fill={colors.redText}>{n.dropped}</text>
              )}
            </g>
          );
        })}
      </svg>
      </div>
      <div style={hint}>
        Green: forwarded. Red: at least one drop (dashed when nothing got through). Click a node or edge to filter the flow table.
      </div>
    </div>
  );
};

const hint: React.CSSProperties = { marginTop: spacing[3], fontSize: fontSize.xs, color: colors.gray400, fontFamily: fonts.mono };
