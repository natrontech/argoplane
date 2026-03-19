import * as React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { colors, fonts, fontSize, spacing, radius } from '@argoplane/shared';
import { formatTimeLabel } from '../utils/format';

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

// --- Color palette ---

const DEFAULT_COLORS = [
  '#00A2B3', '#f5a337', '#0c568f', '#63b343', '#1abe93',
  '#bd19c6', '#fb44be', '#999966', '#80B300', '#1AB399',
  '#ba55ba', '#E6B3B3', '#43680b', '#25b708', '#66994D',
];

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

// --- Custom tooltip (dark overlay) ---

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: number;
  timeRange: string;
  fmt: (v: number) => string;
  seriesColors: string[];
  seriesLabels: string[];
}> = ({ active, payload, label, timeRange, fmt, seriesColors, seriesLabels }) => {
  if (!active || !payload || !label) return null;

  return (
    <div style={tooltipContainer}>
      <div style={tooltipTime}>{formatTimestamp(label, timeRange)}</div>
      <div style={tooltipBody}>
        {payload.map((entry: any, i: number) => {
          const seriesIdx = seriesLabels.indexOf(entry.dataKey);
          const color = seriesColors[seriesIdx % seriesColors.length] || colors.gray500;
          return (
            <div key={entry.dataKey} style={tooltipRow}>
              <span style={{ ...tooltipDot, background: color }} />
              <span style={tooltipLabel}>{entry.dataKey}</span>
              <span style={tooltipValue}>{fmt(entry.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Main component ---

export const MetricsChart: React.FC<MetricsChartProps> = ({
  title,
  unit,
  timestamps,
  series,
  colors: seriesColors = DEFAULT_COLORS,
  height = 150,
  timeRange = '1h',
  syncId = 'argoplane-metrics',
  events,
  thresholds,
  formatValue,
}) => {
  const fmt = formatValue || defaultFormat;
  const [hiddenSeries, setHiddenSeries] = React.useState<Set<string>>(new Set());

  if (!series || series.length === 0 || timestamps.length === 0) {
    return (
      <div style={emptyChart}>
        <span style={emptyText}>{title ? `${title}: no data` : 'No data'}</span>
      </div>
    );
  }

  // Build recharts data array: each entry is { time, series1, series2, ... }
  const data = timestamps.map((ts, i) => {
    const point: Record<string, any> = { time: new Date(ts).getTime() };
    for (const s of series) {
      const v = s.values[i];
      point[s.label] = (v != null && !isNaN(v)) ? v : undefined;
    }
    return point;
  });

  const seriesLabels = series.map((s) => s.label);

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
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} syncId={syncId} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatTimestamp(v, timeRange)}
            tick={{ fontSize: 10, fontFamily: fonts.mono, fill: colors.gray400 }}
            stroke={colors.gray200}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fontSize: 10, fontFamily: fonts.mono, fill: colors.gray400 }}
            stroke={colors.gray200}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={
              <CustomTooltip
                timeRange={timeRange}
                fmt={fmt}
                seriesColors={seriesColors}
                seriesLabels={seriesLabels}
              />
            }
            isAnimationActive={false}
          />

          {/* Event reference lines */}
          {events && events.map((evt, i) => (
            <ReferenceLine
              key={i}
              x={new Date(evt.timestamp).getTime()}
              stroke={colors.red}
              strokeDasharray="3 2"
              strokeWidth={1.5}
            />
          ))}

          {/* Threshold reference lines (horizontal) */}
          {thresholds && thresholds.map((t) => (
            <ReferenceLine
              key={`threshold-${t.name}`}
              y={t.value}
              stroke={t.color}
              strokeDasharray="6 3"
              strokeWidth={1.5}
              label={{
                value: `${t.name}: ${fmt(t.value)}`,
                position: 'insideTopRight',
                fill: t.color,
                fontSize: 10,
              }}
            />
          ))}

          {/* Data lines */}
          {series.map((s, i) => (
            <Line
              key={s.label}
              dataKey={s.label}
              type="monotone"
              stroke={seriesColors[i % seriesColors.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 1.5, stroke: colors.white }}
              connectNulls={false}
              hide={hiddenSeries.has(s.label)}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

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

// Tooltip styles (dark overlay like the reference)
const tooltipContainer: React.CSSProperties = {
  background: 'rgba(41, 37, 36, 0.92)',
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
