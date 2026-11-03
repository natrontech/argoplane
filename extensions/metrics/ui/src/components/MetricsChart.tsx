import * as React from 'react';
import { colors, fonts, fontSize, spacing, radius } from '@argoplane/shared';
import { SERIES_COLORS } from '../utils/palette';

// Hand-rolled SVG line chart. It replaced recharts, which pulled redux
// toolkit, immer and d3 into the bundle (about 340 KB) for one line chart.

// --- Types ---

interface ChartSeries {
  label: string;
  values: number[]; // aligned to timestamps, NaN for gaps
}

interface EventMarker {
  timestamp: string;
  reason: string;
  count: number;
}

interface ThresholdLine {
  name: string;
  color: string;
  value: number;
}

interface MetricsChartProps {
  title?: string;
  unit?: string;
  timestamps: string[];
  series: ChartSeries[];
  colors?: string[];
  height?: number;
  timeRange?: string;
  syncId?: string;
  events?: EventMarker[];
  thresholds?: ThresholdLine[];
  formatValue?: (v: number) => string;
}

// --- Value formatting ---

function defaultFormat(v: number): string {
  if (v == null || isNaN(v)) return '-';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  if (v === 0) return '0';
  if (Math.abs(v) < 0.1) return v.toFixed(3);
  return v.toFixed(1);
}

function formatTimestamp(unix: number, range: string): string {
  const d = new Date(unix);
  if (range === '7d') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// --- Scales ---

const PAD = { top: 4, right: 8, bottom: 18, left: 48 };
const X_TICK_GAP = 80; // px between time labels

/** Rounds a raw step up to 1, 2 or 5 times a power of ten. */
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Y domain from zero (or the lowest value) to a rounded top, with about five ticks. */
function yDomain(series: ChartSeries[], hidden: Set<string>): { min: number; max: number; ticks: number[] } {
  let lo = 0;
  let hi = 0;
  for (const s of series) {
    if (hidden.has(s.label)) continue;
    for (const v of s.values) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / 4);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return { min, max, ticks };
}

/** Index of the timestamp closest to t (times are sorted ascending). */
function nearestIndex(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t - times[lo - 1] < times[lo] - t ? lo - 1 : lo;
}

// --- Hover sync across charts sharing a syncId ---

const HOVER_EVENT = 'argoplane-chart-hover';

function emitHover(syncId: string, time: number | null) {
  window.dispatchEvent(new CustomEvent(HOVER_EVENT, { detail: { syncId, time } }));
}

function useSyncedHover(syncId: string): number | null {
  const [time, setTime] = React.useState<number | null>(null);
  React.useEffect(() => {
    const onHover = (e: Event) => {
      const { syncId: id, time: t } = (e as CustomEvent<{ syncId: string; time: number | null }>).detail;
      if (id === syncId) setTime(t);
    };
    window.addEventListener(HOVER_EVENT, onHover);
    return () => window.removeEventListener(HOVER_EVENT, onHover);
  }, [syncId]);
  return time;
}

/**
 * Container width, kept current with a ResizeObserver. Returns a callback ref:
 * the plot div only mounts once there is data, so a mount-time effect would
 * miss it.
 */
function useWidth(): [number, (el: HTMLDivElement | null) => void] {
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [width, setEl];
}

// --- Main component ---

export const MetricsChart: React.FC<MetricsChartProps> = ({
  title,
  unit,
  timestamps,
  series,
  colors: seriesColors = SERIES_COLORS,
  height = 150,
  timeRange = '1h',
  syncId = 'argoplane-metrics',
  events,
  thresholds,
  formatValue,
}) => {
  const fmt = formatValue || defaultFormat;
  const [hiddenSeries, setHiddenSeries] = React.useState<Set<string>>(new Set());
  const [width, plotRef] = useWidth();
  const hoverTime = useSyncedHover(syncId);

  const times = React.useMemo(() => timestamps.map((ts) => new Date(ts).getTime()), [timestamps]);
  const domain = React.useMemo(() => yDomain(series, hiddenSeries), [series, hiddenSeries]);

  if (!series || series.length === 0 || timestamps.length === 0) {
    return (
      <div style={emptyChart}>
        <span style={emptyText}>{title ? `${title}: no data` : 'No data'}</span>
      </div>
    );
  }

  const toggleSeries = (label: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        // Don't allow hiding all series
        if (next.size < series.length - 1) {
          next.add(label);
        }
      }
      return next;
    });
  };

  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = Math.max(height - PAD.top - PAD.bottom, 1);
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const x = (t: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - domain.min) / (domain.max - domain.min)) * plotH;
  const inDomain = (v: number) => v >= domain.min && v <= domain.max;

  const xTickCount = Math.max(2, Math.floor(plotW / X_TICK_GAP) + 1);
  const xTicks = t1 === t0 ? [t0] : Array.from({ length: xTickCount }, (_, i) => t0 + ((t1 - t0) * i) / (xTickCount - 1));

  // Break the line wherever a value is missing (no connecting across gaps).
  const pathFor = (values: number[]) => {
    let d = '';
    let open = false;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`;
      open = true;
    });
    return d;
  };

  const hoverIdx = hoverTime != null && hoverTime >= t0 && hoverTime <= t1 ? nearestIndex(times, hoverTime) : null;
  const hoverX = hoverIdx != null ? x(times[hoverIdx]) : 0;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const t = t0 + ((px - PAD.left) / plotW) * (t1 - t0);
    emitHover(syncId, times[nearestIndex(times, t)]);
  };

  const visible = series.map((s, i) => ({ s, color: seriesColors[i % seriesColors.length] })).filter(({ s }) => !hiddenSeries.has(s.label));

  return (
    <div style={chartContainer}>
      {/* Header with title and unit */}
      {title && (
        <div style={headerStyle}>
          <span style={titleStyle}>{title}</span>
          {unit && <span style={unitStyle}>{unit}</span>}
        </div>
      )}

      {/* Chart */}
      <div ref={plotRef} style={{ position: 'relative', height }}>
        {width > 0 && (
          // Absolutely positioned so its fixed width never stops the column
          // from shrinking; the ResizeObserver then reports the new width.
          <svg width={width} height={height} style={{ display: 'block', position: 'absolute', top: 0, left: 0 }} onMouseMove={onMove} onMouseLeave={() => emitHover(syncId, null)}>
            {/* Grid and value axis */}
            {domain.ticks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} stroke={colors.gray200} strokeDasharray="3 3" />
                <text x={PAD.left - 4} y={y(v)} dy="0.32em" textAnchor="end" fontSize={10} fontFamily={fonts.mono} fill={colors.gray400}>{fmt(v)}</text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <g key={`x${i}`}>
                <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.gray200} strokeDasharray="3 3" />
                <text
                  x={x(t)}
                  y={height - 4}
                  textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                  fontSize={10}
                  fontFamily={fonts.mono}
                  fill={colors.gray400}
                >
                  {formatTimestamp(t, timeRange)}
                </text>
              </g>
            ))}
            <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={colors.gray200} />

            {/* Event markers (vertical) */}
            {events?.map((evt, i) => {
              const t = new Date(evt.timestamp).getTime();
              if (t < t0 || t > t1) return null;
              return <line key={`e${i}`} x1={x(t)} x2={x(t)} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.red} strokeDasharray="3 2" strokeWidth={1.5} />;
            })}

            {/* Thresholds (horizontal), only when inside the value range */}
            {thresholds?.filter((t) => inDomain(t.value)).map((t) => (
              <g key={`threshold-${t.name}`}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t.value)} y2={y(t.value)} stroke={t.color} strokeDasharray="6 3" strokeWidth={1.5} />
                <text x={PAD.left + plotW - 4} y={y(t.value) + 12} textAnchor="end" fontSize={10} fill={t.color}>
                  {`${t.name}: ${fmt(t.value)}`}
                </text>
              </g>
            ))}

            {/* Data lines */}
            {visible.map(({ s, color }) => (
              <path key={s.label} d={pathFor(s.values)} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
            ))}

            {/* Hover crosshair and points */}
            {hoverIdx != null && (
              <g pointerEvents="none">
                <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + plotH} stroke={colors.gray300} />
                {visible.map(({ s, color }) => {
                  const v = s.values[hoverIdx];
                  if (!Number.isFinite(v)) return null;
                  return <circle key={s.label} cx={hoverX} cy={y(v)} r={3} fill={color} stroke={colors.white} strokeWidth={1.5} />;
                })}
              </g>
            )}
          </svg>
        )}

        {/* Tooltip */}
        {hoverIdx != null && (
          <div style={{ ...tooltipContainer, ...(hoverX > width / 2 ? { right: width - hoverX + 12 } : { left: hoverX + 12 }) }}>
            <div style={tooltipTime}>{formatTimestamp(times[hoverIdx], timeRange)}</div>
            <div style={tooltipBody}>
              {visible.map(({ s, color }) => {
                const v = s.values[hoverIdx];
                if (!Number.isFinite(v)) return null;
                return (
                  <div key={s.label} style={tooltipRow}>
                    <span style={{ ...tooltipDot, background: color }} />
                    <span style={tooltipLabel}>{s.label}</span>
                    <span style={tooltipValue}>{fmt(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend (below chart, interactive) */}
      {series.length > 1 && (
        <div style={legendBar}>
          {series.map((s, i) => {
            const color = seriesColors[i % seriesColors.length];
            const hidden = hiddenSeries.has(s.label);
            return (
              <button
                key={s.label}
                onClick={() => toggleSeries(s.label)}
                style={{ ...legendItem, opacity: hidden ? 0.3 : 1 }}
              >
                <span style={{ ...legendDot, background: color }} />
                <span style={legendLabel}>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- Styles ---

const chartContainer: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: spacing[3],
  minWidth: 0,
};

const emptyChart: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 100,
  fontSize: fontSize.sm,
  color: colors.gray400,
  background: colors.gray50,
  border: `1px dashed ${colors.gray200}`,
  borderRadius: radius.md,
};

const emptyText: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: fontSize.xs,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: spacing[1],
};

const titleStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  color: colors.gray500,
};

const unitStyle: React.CSSProperties = {
  fontSize: fontSize.xs,
  color: colors.gray400,
  fontFamily: fonts.mono,
};

// Tooltip styles (dark overlay)
const tooltipContainer: React.CSSProperties = {
  position: 'absolute',
  top: PAD.top,
  zIndex: 1,
  pointerEvents: 'none',
  background: colors.gray800,
  borderRadius: radius.md,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  minWidth: 160,
  border: `1px solid ${colors.gray700}`,
};

const tooltipTime: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  color: colors.gray300,
  marginBottom: spacing[1],
};

const tooltipBody: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const tooltipRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: fontSize.xs,
};

const tooltipDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};

const tooltipLabel: React.CSSProperties = {
  color: colors.gray300,
  fontFamily: fonts.mono,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const tooltipValue: React.CSSProperties = {
  color: colors.white,
  fontFamily: fonts.mono,
  fontWeight: 600,
};

// Legend styles (clickable, below chart)
const legendBar: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing[2],
  marginTop: spacing[1],
  paddingTop: spacing[1],
};

const legendItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  transition: 'opacity 150ms',
};

const legendDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 1,
  flexShrink: 0,
};

const legendLabel: React.CSSProperties = {
  color: colors.gray600,
};
