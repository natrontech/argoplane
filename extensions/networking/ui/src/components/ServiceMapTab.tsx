import * as React from 'react';
import { Loading, EmptyState, colors, fonts, fontSize, fontWeight, spacing } from '@argoplane/shared';
import { fetchServiceMap } from '../api';
import { ServiceMapNode, ServiceMapEdge, ServiceMapResponse, TimeRange } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }
interface Box { x: number; y: number; w: number; h: number }
type Sides = { top: [Pt, Pt]; bottom: [Pt, Pt]; left: [Pt, Pt]; right: [Pt, Pt] }
type VerdictFilter = 'all' | 'forwarded' | 'dropped' | 'mixed';

// ─── Constants (scaled from Hubble's vars) ────────────────────────────────────

const NODE_W = 180;
const NODE_H = 60;
const H_PAD = 80;   // horizontal gap between columns  (Hubble: 200)
const V_PAD = 16;   // vertical gap between rows        (Hubble: 200, we're tighter)
const NS_PAD = 20;  // namespace backplate padding
const CONN_GAP = 20; // gap from card edge to arrow start/end
const AROUND_PAD = 18; // goAroundTheBox padding

const VERDICT_COLOR: Record<string, string> = {
  forwarded: '#16A34A',
  dropped:   '#B91C1C',
  mixed:     '#A16207',
};

// ─── PlacementKind — mirrors Hubble's enum ────────────────────────────────────

enum Kind {
  FromWorld = 'FromWorld',
  ToWorld   = 'ToWorld',
  InsideConn   = 'InsideConn',
  InsideNoConn = 'InsideNoConn',
  CrossNs   = 'CrossNs',
}

interface NodeMeta { id: string; node: ServiceMapNode; kind: Kind; weight: number }
interface LayoutEntry { id: string; node: ServiceMapNode; kind: Kind; box: Box }

// ─── Geometry utilities (ported from Hubble's domain/geometry) ────────────────

function boxSides(b: Box): Sides {
  const x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
  return {
    top:    [{ x: x1, y: y1 }, { x: x2, y: y1 }],
    bottom: [{ x: x1, y: y2 }, { x: x2, y: y2 }],
    left:   [{ x: x1, y: y1 }, { x: x1, y: y2 }],
    right:  [{ x: x2, y: y1 }, { x: x2, y: y2 }],
  };
}

function segmentsIntersection(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const EPS = 1e-9;
  const tooSmall = (v: number) => Math.abs(v) < EPS;

  const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;

  if (tooSmall(dx2) && tooSmall(dx1)) return null;
  if (tooSmall(dy1) && tooSmall(dy2)) return null;

  const s1 = dy1 / dx1;
  const s2 = dy2 / dx2;
  if (tooSmall(s1 - s2)) return null;

  let x: number, y: number;

  if (!tooSmall(dx1) && tooSmall(dx2)) {
    x = p3.x; y = s1 * (x - p1.x) + p1.y;
  } else if (!tooSmall(dx2) && tooSmall(dx1)) {
    x = p1.x; y = s2 * (x - p3.x) + p3.y;
  } else {
    x = (s1 * p1.x - p1.y - s2 * p3.x + p3.y) / (s1 - s2);
    y = s1 * (x - p1.x) + p1.y;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // Must be within both segments
  const eps = 0.005;
  const inSeg = (v: number, a: number, b: number) => v >= Math.min(a, b) - eps && v <= Math.max(a, b) + eps;
  if (!inSeg(x, p1.x, p2.x) || !inSeg(y, p1.y, p2.y)) return null;
  if (!inSeg(x, p3.x, p4.x) || !inSeg(y, p3.y, p4.y)) return null;

  return { x, y };
}

function goAroundTheBox(box: Box, from: Pt, to: Pt, padX: number, padY: number): Pt[] {
  const sides = boxSides(box);
  const points: Pt[] = [];

  const getAround = (f: Pt, t: Pt): Pt | null => {
    const xsect: Record<string, Pt | null> = {
      top:    segmentsIntersection(f, t, ...sides.top),
      bottom: segmentsIntersection(f, t, ...sides.bottom),
      left:   segmentsIntersection(f, t, ...sides.left),
      right:  segmentsIntersection(f, t, ...sides.right),
    };
    const hits = Object.entries(xsect).filter(([, v]) => v != null) as [string, Pt][];
    if (hits.length < 2) return null;

    const dist = (p: Pt) => Math.hypot(p.x - f.x, p.y - f.y);
    hits.sort((a, b) => dist(a[1]) - dist(b[1]));
    const [s1, s2] = hits.map(h => h[0]);

    const bx1 = box.x, bx2 = box.x + box.w, by1 = box.y, by2 = box.y + box.h;

    if ((s1 === 'top' && s2 === 'bottom') || (s1 === 'bottom' && s2 === 'top')) {
      const midX = (bx1 + bx2) / 2;
      const keepLeft = (hits[0][1].x + hits[1][1].x) / 2 < midX;
      return { x: keepLeft ? bx1 - padX : bx2 + padX, y: s1 === 'bottom' ? by2 + padY : by1 - padY };
    }
    if ((s1 === 'left' && s2 === 'right') || (s1 === 'right' && s2 === 'left')) {
      const midY = (by1 + by2) / 2;
      const keepTop = (hits[0][1].y + hits[1][1].y) / 2 < midY;
      return { x: s1 === 'left' ? bx1 - padX : bx2 + padX, y: keepTop ? by1 - padY : by2 + padY };
    }
    if (s1 === 'top'    && s2 === 'left'   || s1 === 'left'   && s2 === 'top')    return { x: bx1 - padX, y: by1 - padY };
    if (s1 === 'top'    && s2 === 'right'  || s1 === 'right'  && s2 === 'top')    return { x: bx2 + padX, y: by1 - padY };
    if (s1 === 'bottom' && s2 === 'right'  || s1 === 'right'  && s2 === 'bottom') return { x: bx2 + padX, y: by2 + padY };
    if (s1 === 'bottom' && s2 === 'left'   || s1 === 'left'   && s2 === 'bottom') return { x: bx1 - padX, y: by2 + padY };
    return null;
  };

  const p1 = getAround(from, to);
  if (p1) {
    points.push(p1);
    const p2 = getAround(p1, to);
    if (p2) points.push(p2);
  }

  return points;
}

// ─── Edge merging ─────────────────────────────────────────────────────────────
// Collapse all edges between the same workload pair into a single edge.
// Without this, ephemeral port flows (e.g. 1000s of DNS reply UDP ports)
// produce hundreds of stacked arrows that extend far outside node bounds.

function mergeEdges(edges: ServiceMapEdge[]): ServiceMapEdge[] {
  const merged = new Map<string, {
    source: string; target: string;
    forwarded: number; dropped: number;
    protos: Set<string>;
  }>();

  edges.forEach(e => {
    const key = `${e.source}||${e.target}`;
    if (!merged.has(key)) {
      merged.set(key, { source: e.source, target: e.target, forwarded: 0, dropped: 0, protos: new Set() });
    }
    const m = merged.get(key)!;
    m.forwarded += e.forwarded;
    m.dropped += e.dropped;
    m.protos.add(e.protocol);
  });

  return Array.from(merged.entries()).map(([key, m]) => ({
    id: key,
    source: m.source,
    target: m.target,
    protocol: Array.from(m.protos).join('/'),
    port: 0,  // multiple ports merged — show protocol only
    forwarded: m.forwarded,
    dropped: m.dropped,
    verdict: (m.forwarded > 0 && m.dropped > 0 ? 'mixed' : m.dropped > 0 ? 'dropped' : 'forwarded') as ServiceMapEdge['verdict'],
  }));
}

// ─── Layout algorithm (Hubble's column-based placement) ───────────────────────

function classifyNode(node: ServiceMapNode, edges: ServiceMapEdge[], targetNs: string): NodeMeta {
  const incomings  = edges.filter(e => e.target === node.id).length;
  const outgoings  = edges.filter(e => e.source === node.id).length;

  let kind: Kind;
  if (node.kind === 'external' || node.kind === 'world') {
    kind = incomings > 0 ? Kind.ToWorld : Kind.FromWorld;
  } else if (node.namespace && node.namespace !== targetNs) {
    kind = Kind.CrossNs;
  } else if (incomings > 0 || outgoings > 0) {
    kind = Kind.InsideConn;
  } else {
    kind = Kind.InsideNoConn;
  }

  const weight = outgoings - incomings;
  return { id: node.id, node, kind, weight };
}

// Hubble: sort by weight desc, ceil(sqrt(n)) max per column, flush on weight change
function buildColumns(metas: NodeMeta[]): NodeMeta[][] {
  if (metas.length === 0) return [];
  const sorted = [...metas].sort((a, b) => b.weight - a.weight);
  const maxPerCol = Math.max(1, Math.ceil(Math.sqrt(metas.length)));
  const cols: NodeMeta[][] = [];
  let cur: NodeMeta[] = [];
  let lastWeight: number | null = null;

  sorted.forEach((m, i) => {
    const flush = cur.length >= maxPerCol || (lastWeight !== null && m.weight !== lastWeight);
    if (flush) { cols.push(cur); cur = []; }
    lastWeight = m.weight;
    cur.push(m);
    if (i === sorted.length - 1) cols.push(cur);
  });

  return cols;
}

// Hubble's alignColumns: places columns side by side, vertically centers each column
function placeColumns(cols: NodeMeta[][]): { entries: LayoutEntry[]; bbox: Box } {
  const entries: LayoutEntry[] = [];
  const colGroups: { ents: LayoutEntry[]; h: number }[] = [];
  let ox = 0, totalH = 0;

  cols.forEach((col) => {
    const ents: LayoutEntry[] = [];
    let maxW = 0, colH = 0, oy = 0;

    col.forEach((m, ri) => {
      const entry: LayoutEntry = { id: m.id, node: m.node, kind: m.kind, box: { x: ox, y: oy, w: NODE_W, h: NODE_H } };
      ents.push(entry);
      entries.push(entry);
      maxW = Math.max(maxW, NODE_W);
      colH += NODE_H + (ri === 0 ? 0 : V_PAD);
      oy += NODE_H + V_PAD;
    });

    totalH = Math.max(totalH, colH);
    colGroups.push({ ents, h: colH });
    ox += maxW + H_PAD;
  });

  // Vertical centering within each column
  colGroups.forEach(({ ents, h }) => {
    const offset = (totalH - h) / 2;
    ents.forEach(e => { e.box.y += offset; });
  });

  const totalW = Math.max(ox - H_PAD, NODE_W);
  return { entries, bbox: { x: 0, y: 0, w: totalW, h: totalH } };
}

interface LayoutResult {
  placement: Map<string, Box>;
  namespaceBBox: Box | null;
  totalW: number;
  totalH: number;
}

function computeLayout(nodes: ServiceMapNode[], edges: ServiceMapEdge[], targetNs: string): LayoutResult {
  if (nodes.length === 0) return { placement: new Map(), namespaceBBox: null, totalW: 0, totalH: 0 };

  // Classify all nodes
  const metas = nodes.map(n => classifyNode(n, edges, targetNs));

  // Group by kind
  const groups = new Map<Kind, NodeMeta[]>();
  metas.forEach(m => {
    if (!groups.has(m.kind)) groups.set(m.kind, []);
    groups.get(m.kind)!.push(m);
  });

  // Build columns per kind
  const kindCols = new Map<Kind, NodeMeta[][]>();
  groups.forEach((ms, k) => kindCols.set(k, buildColumns(ms)));

  // ── Three sections (Hubble's assignCoordinates) ───────────────────────────
  // TOP: ToWorld
  // MIDDLE: FromWorld | InsideConn | InsideNoConn
  // BOTTOM: CrossNs

  const placeKinds = (...kinds: Kind[]) => {
    const allCols: NodeMeta[][] = [];
    kinds.forEach(k => { if (kindCols.has(k)) allCols.push(...kindCols.get(k)!); });
    return placeColumns(allCols);
  };

  const topGroup    = placeKinds(Kind.ToWorld);
  const middleGroup = placeKinds(Kind.FromWorld, Kind.InsideConn, Kind.InsideNoConn);
  const bottomGroup = placeKinds(Kind.CrossNs);

  // Shift sections vertically
  const shiftY = (entries: LayoutEntry[], dy: number) => entries.forEach(e => { e.box.y += dy; });
  const shiftX = (entries: LayoutEntry[], dx: number) => entries.forEach(e => { e.box.x += dx; });

  // Center top over middle's InsideConn columns
  const insideStart = middleGroup.entries
    .filter(e => e.kind === Kind.InsideConn || e.kind === Kind.InsideNoConn)
    .reduce((min, e) => Math.min(min, e.box.x), Infinity);
  const insideEnd = middleGroup.entries
    .filter(e => e.kind === Kind.InsideConn || e.kind === Kind.InsideNoConn)
    .reduce((max, e) => Math.max(max, e.box.x + e.box.w), -Infinity);
  const insideCenterX = (insideStart + insideEnd) / 2;

  if (topGroup.entries.length > 0) {
    const topCenterX = topGroup.bbox.w / 2;
    shiftX(topGroup.entries, insideCenterX - topCenterX);
  }

  // Stack sections: top → middle → bottom
  let currentY = 0;
  if (topGroup.entries.length > 0) {
    currentY += topGroup.bbox.h + NS_PAD * 2;
  }
  shiftY(middleGroup.entries, currentY);
  currentY += middleGroup.bbox.h + NS_PAD * 2;
  if (bottomGroup.entries.length > 0) {
    // Center bottom under inside
    const botCenterX = bottomGroup.bbox.w / 2;
    shiftX(bottomGroup.entries, insideCenterX - botCenterX);
    shiftY(bottomGroup.entries, currentY);
    currentY += bottomGroup.bbox.h;
  }

  // Build placement map and compute namespace backplate
  const placement = new Map<string, Box>();
  const allEntries = [...topGroup.entries, ...middleGroup.entries, ...bottomGroup.entries];

  let nsMinX = Infinity, nsMinY = Infinity, nsMaxX = -Infinity, nsMaxY = -Infinity;
  allEntries.forEach(e => {
    placement.set(e.id, e.box);
    if (e.kind === Kind.InsideConn || e.kind === Kind.InsideNoConn) {
      nsMinX = Math.min(nsMinX, e.box.x);
      nsMinY = Math.min(nsMinY, e.box.y);
      nsMaxX = Math.max(nsMaxX, e.box.x + e.box.w);
      nsMaxY = Math.max(nsMaxY, e.box.y + e.box.h);
    }
  });

  const namespaceBBox = nsMinX < Infinity
    ? { x: nsMinX - NS_PAD, y: nsMinY - NS_PAD, w: nsMaxX - nsMinX + NS_PAD * 2, h: nsMaxY - nsMinY + NS_PAD * 2 }
    : null;

  // Compute total canvas extents (add padding)
  const PAD = 30;
  const allXs = allEntries.map(e => [e.box.x, e.box.x + e.box.w]).flat();
  const allYs = allEntries.map(e => [e.box.y, e.box.y + e.box.h]).flat();
  const minX = Math.min(...allXs);
  const minY = Math.min(...allYs);

  // Normalise: shift everything so top-left starts at (PAD, PAD)
  const offX = PAD - minX;
  const offY = PAD - minY;
  allEntries.forEach(e => { e.box.x += offX; e.box.y += offY; });
  if (namespaceBBox) { namespaceBBox.x += offX; namespaceBBox.y += offY; }

  const totalW = Math.max(...allEntries.map(e => e.box.x + e.box.w)) + PAD;
  const totalH = Math.max(...allEntries.map(e => e.box.y + e.box.h)) + PAD;

  return { placement, namespaceBBox, totalW, totalH };
}

// ─── Arrow point computation ──────────────────────────────────────────────────

interface ArrowPath { id: string; points: Pt[]; verdict: string; protocol: string; port: number }

function computeArrows(edges: ServiceMapEdge[], placement: Map<string, Box>): ArrowPath[] {
  // Group by receiver to stack connectors vertically
  const byReceiver = new Map<string, ServiceMapEdge[]>();
  edges.forEach(e => {
    if (!byReceiver.has(e.target)) byReceiver.set(e.target, []);
    byReceiver.get(e.target)!.push(e);
  });

  const bySender = new Map<string, ServiceMapEdge[]>();
  edges.forEach(e => {
    if (!bySender.has(e.source)) bySender.set(e.source, []);
    bySender.get(e.source)!.push(e);
  });

  const CONN_SPACING = 10; // vertical spacing between stacked connectors

  const connY = (box: Box, idx: number, total: number): number =>
    box.y + box.h / 2 + (idx - (total - 1) / 2) * CONN_SPACING;

  const paths: ArrowPath[] = [];
  const aroundOffsets = new Map<string, number>(); // receiver id → cumulative around offset

  edges.forEach(edge => {
    const sBox = placement.get(edge.source);
    const rBox = placement.get(edge.target);
    if (!sBox || !rBox || edge.source === edge.target) return;

    // Connector Y positions
    const sEdges = bySender.get(edge.source) ?? [];
    const rEdges = byReceiver.get(edge.target) ?? [];
    const si = sEdges.indexOf(edge);
    const ri = rEdges.indexOf(edge);
    const startY = connY(sBox, si, sEdges.length);
    const endY   = connY(rBox, ri, rEdges.length);

    const start:   Pt = { x: sBox.x + sBox.w, y: startY };
    const end:     Pt = { x: rBox.x, y: endY };
    const shifted0: Pt = { x: start.x + CONN_GAP, y: startY };
    const shiftedN: Pt = { x: end.x   - CONN_GAP, y: endY };

    const receiverOnLeft = sBox.x + sBox.w / 2 > rBox.x + rBox.w / 2;

    let midPoints: Pt[] = [];
    if (!receiverOnLeft) {
      // Simple: go straight right then to receiver
      midPoints = [shifted0, shiftedN];
    } else {
      // Route around sender first
      const around1 = goAroundTheBox(sBox, shifted0, shiftedN, AROUND_PAD, AROUND_PAD);
      const senderExit = around1[around1.length - 1] ?? shifted0;

      // Increment around offset per receiver to avoid overlap
      const prevOff = aroundOffsets.get(edge.target) ?? 0;
      const around2 = goAroundTheBox(rBox, senderExit, shiftedN, AROUND_PAD + prevOff, AROUND_PAD + prevOff);
      if (around2.length > 0) aroundOffsets.set(edge.target, prevOff + 8);

      midPoints = [shifted0, ...around1, ...around2, shiftedN];
    }

    paths.push({ id: edge.id, points: [start, ...midPoints, end], verdict: edge.verdict, protocol: edge.protocol, port: edge.port });
  });

  return paths;
}

// ─── SVG rendering ────────────────────────────────────────────────────────────

// Smooth polyline using SVG path with rounded corners (radius r)
function smoothPath(pts: Pt[], r = 6): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const t1x = cur.x - (rr / d1) * (cur.x - prev.x);
    const t1y = cur.y - (rr / d1) * (cur.y - prev.y);
    const t2x = cur.x + (rr / d2) * (next.x - cur.x);
    const t2y = cur.y + (rr / d2) * (next.y - cur.y);
    d += ` L${t1x},${t1y} Q${cur.x},${cur.y} ${t2x},${t2y}`;
  }
  d += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  return d;
}

const NodeCard: React.FC<{ node: ServiceMapNode; box: Box }> = ({ node, box }) => {
  const isExternal = node.kind !== 'workload';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={3}
        fill={isExternal ? colors.gray50 : colors.white}
        stroke={isExternal ? colors.gray300 : colors.orange500}
        strokeWidth={isExternal ? 1 : 1.5}
      />
      <text x={box.x + box.w / 2} y={box.y + 18} textAnchor="middle"
        style={{ fontFamily: fonts.mono, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, fill: colors.gray800 }}>
        {node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
      </text>
      {node.namespace && !isExternal && (
        <text x={box.x + box.w / 2} y={box.y + 34} textAnchor="middle"
          style={{ fontFamily: fonts.mono, fontSize: fontSize.xs, fill: colors.gray400 }}>
          {node.namespace}
        </text>
      )}
      {(node.pods?.length ?? 0) > 0 && (
        <text x={box.x + box.w / 2} y={box.y + 50} textAnchor="middle"
          style={{ fontFamily: fonts.mono, fontSize: 9, fill: colors.gray500 }}>
          {node.pods!.length} pod{node.pods!.length !== 1 ? 's' : ''}
        </text>
      )}
    </g>
  );
};

const ArrowSvg: React.FC<{ arrow: ArrowPath }> = ({ arrow }) => {
  const color = VERDICT_COLOR[arrow.verdict] || colors.gray400;
  const markerId = `arr-${arrow.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
  const label = arrow.port > 0 ? `${arrow.protocol}:${arrow.port}` : arrow.protocol;

  // Place label at midpoint of arrow path
  const mid = arrow.points[Math.floor(arrow.points.length / 2)];

  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill={color} />
        </marker>
      </defs>
      <path d={smoothPath(arrow.points)} fill="none" stroke={color} strokeWidth={1.5}
        markerEnd={`url(#${markerId})`} opacity={0.8} />
      {label && mid && (
        <>
          <rect x={mid.x - 28} y={mid.y - 8} width={56} height={14} rx={2} fill="rgba(255,255,255,0.9)" />
          <text x={mid.x} y={mid.y + 3} textAnchor="middle" style={{ fontFamily: fonts.mono, fontSize: 9, fill: colors.gray600 }}>{label}</text>
        </>
      )}
    </g>
  );
};

// ─── Canvas with native pan/zoom ──────────────────────────────────────────────

interface CanvasProps {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  namespace: string;
}

const ServiceMapCanvas: React.FC<CanvasProps> = ({ nodes, edges, namespace }) => {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [transform, setTransform] = React.useState({ x: 30, y: 30, k: 1 });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const { placement, namespaceBBox, totalW, totalH } = React.useMemo(
    () => computeLayout(nodes, edges, namespace),
    [nodes, edges, namespace]
  );
  const arrows = React.useMemo(() => computeArrows(edges, placement), [edges, placement]);

  // ResizeObserver
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    return () => ro.disconnect();
  }, []);

  // Auto-fit on layout change — scale to fill width; allow upscaling for small graphs
  React.useEffect(() => {
    const w = size.w > 0 ? size.w : 600;
    if (totalW === 0 || totalH === 0) return;
    const pad = 30;
    const k = Math.min(2, (w - pad * 2) / totalW);
    setTransform({ x: pad, y: pad, k });
  }, [totalW, totalH, size.w]);

  // Native pointer drag + wheel zoom
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let active = false, lastX = 0, lastY = 0;

    const onDown = (e: PointerEvent) => {
      active = true; lastX = e.clientX; lastY = e.clientY;
      svg.setPointerCapture(e.pointerId);
      e.stopPropagation(); e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!active) return;
      setTransform(t => ({ ...t, x: t.x + e.clientX - lastX, y: t.y + e.clientY - lastY }));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onUp = () => { active = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      setTransform(t => {
        const k2 = Math.max(0.1, Math.min(4, t.k * factor));
        return { k: k2, x: mx - (mx - t.x) * (k2 / t.k), y: my - (my - t.y) * (k2 / t.k) };
      });
    };

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      svg.removeEventListener('wheel', onWheel);
    };
  }, []);

  const svgW = size.w > 0 ? size.w : 640;
  // Dynamic height: fit to content so the canvas doesn't show wasted gray space
  const canvasPad = 30;
  const contentH = totalH > 0 ? Math.ceil(totalH * transform.k) + canvasPad * 2 + 20 : 0;
  const svgH = Math.max(200, contentH || (size.h > 0 ? size.h : 300));

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} width={svgW} height={svgH}
        style={{ display: 'block', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}>
        <rect width={svgW} height={svgH} fill={colors.gray50} />
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Namespace backplate */}
          {namespaceBBox && (
            <rect x={namespaceBBox.x} y={namespaceBBox.y}
              width={namespaceBBox.w} height={namespaceBBox.h}
              rx={6}
              fill={`${colors.orange500}08`}
              stroke={`${colors.orange500}40`}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}
          {/* Arrows behind nodes */}
          {arrows.map(a => <ArrowSvg key={a.id} arrow={a} />)}
          {/* Nodes on top */}
          {nodes.map(n => {
            const box = placement.get(n.id);
            if (!box) return null;
            return <NodeCard key={n.id} node={n} box={box} />;
          })}
        </g>
      </svg>
    </div>
  );
};

// ─── Legend ───────────────────────────────────────────────────────────────────

const Legend: React.FC = () => (
  <div style={{ display: 'flex', gap: spacing[3], alignItems: 'center' }}>
    {(['forwarded', 'dropped', 'mixed'] as const).map(v => (
      <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray500 }}>
        <span style={{ width: 16, height: 2, background: VERDICT_COLOR[v], display: 'inline-block', borderRadius: 1 }} />
        {v}
      </span>
    ))}
    <span style={{ color: colors.gray200 }}>·</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray500 }}>
      <span style={{ width: 10, height: 10, border: `1px dashed ${colors.orange500}40`, borderRadius: 2, display: 'inline-block', background: `${colors.orange500}08` }} />
      namespace
    </span>
    <span style={{ fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray400 }}>scroll to zoom · drag to pan</span>
  </div>
);

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
  lineHeight: '20px',
});

// ─── Main component ───────────────────────────────────────────────────────────

interface ServiceMapTabProps {
  namespace: string;
  appNamespace: string;
  appName: string;
  project: string;
  since: TimeRange;
  scopedPods?: string[];
}

export const ServiceMapTab: React.FC<ServiceMapTabProps> = ({
  namespace, appNamespace, appName, project, since, scopedPods,
}) => {
  const [data, setData] = React.useState<ServiceMapResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = React.useState<VerdictFilter>('all');
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const load = React.useCallback((showLoading = false) => {
    if (!namespace) return;
    if (showLoading) setLoading(true);
    fetchServiceMap(namespace, appNamespace, appName, project, since, scopedPods)
      .then(res => { setData(res); setError(null); setLastUpdated(new Date()); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [namespace, appNamespace, appName, project, since, scopedPods]);

  React.useEffect(() => { load(true); }, [load]);
  React.useEffect(() => {
    const id = setInterval(() => load(false), 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Merge multi-port edges then apply verdict filter
  const mergedEdges = React.useMemo(() => {
    if (!data) return [];
    return mergeEdges(data.edges);
  }, [data]);

  const filteredEdges = React.useMemo(() => {
    return verdictFilter === 'all' ? mergedEdges : mergedEdges.filter(e => e.verdict === verdictFilter);
  }, [mergedEdges, verdictFilter]);

  const visibleNodes = React.useMemo(() => {
    if (!data) return [];
    if (verdictFilter === 'all') return data.nodes;
    const seen = new Set<string>();
    filteredEdges.forEach(e => { seen.add(e.source); seen.add(e.target); });
    return data.nodes.filter(n => seen.has(n.id));
  }, [data, verdictFilter, filteredEdges]);

  if (loading && !data) return <div style={{ padding: spacing[4] }}><Loading /></div>;
  if (error && !data) return (
    <div style={{ padding: spacing[4] }}>
      <div style={{ color: colors.redText, fontFamily: fonts.mono, fontSize: fontSize.sm, marginBottom: spacing[2] }}>{error}</div>
      <button style={pill(false)} onClick={() => load(true)}>Retry</button>
    </div>
  );
  if (!data?.hubble) return (
    <div style={{ padding: spacing[4] }}>
      <div style={{ padding: spacing[3], background: colors.gray50, border: `1px solid ${colors.gray200}`, borderRadius: 4, color: colors.gray500, fontSize: fontSize.sm }}>
        Hubble Relay not configured. Enable it to see the service map.
      </div>
    </div>
  );
  if ((data?.nodes ?? []).length === 0) return (
    <div style={{ padding: spacing[4] }}>
      <EmptyState message={`No traffic flows in the last ${since}. Try increasing the time range.`} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: spacing[2] }}>
        <Legend />
        <div style={{ display: 'flex', gap: spacing[1], alignItems: 'center' }}>
          {(['all', 'forwarded', 'dropped', 'mixed'] as VerdictFilter[]).map(v => (
            <button key={v} style={pill(verdictFilter === v)} onClick={() => setVerdictFilter(v)}>{v}</button>
          ))}
          <button onClick={() => load()} style={{ ...pill(false), marginLeft: spacing[1] }}>
            ↻ {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ border: `1px solid ${colors.gray200}`, borderRadius: 4, overflow: 'hidden' }}>
        {visibleNodes.length === 0
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: colors.gray400, fontFamily: fonts.mono, fontSize: fontSize.sm }}>
              No {verdictFilter} connections.
            </div>
          : <ServiceMapCanvas nodes={visibleNodes} edges={filteredEdges} namespace={namespace} />
        }
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray400 }}>
        {visibleNodes.length} node{visibleNodes.length !== 1 ? 's' : ''}
        {' · '}{filteredEdges.length} connection{filteredEdges.length !== 1 ? 's' : ''}
        {verdictFilter !== 'all' && ` · ${verdictFilter} only`}
      </div>
    </div>
  );
};
