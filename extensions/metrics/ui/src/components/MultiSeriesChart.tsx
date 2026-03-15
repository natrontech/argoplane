import * as React from 'react';
import { colors, fonts, fontSize, spacing, radius } from '@argoplane/shared';
import { NamedSeries } from '../types';
import { formatTimeLabel } from '../utils/format';

interface MultiSeriesChartProps {
  series: NamedSeries[];
  colors: string[];
  height?: number;
  timeRange?: string;
  formatValue?: (v: number) => string;
}

const PADDING = { top: 8, right: 12, bottom: 24, left: 60 };

export const MultiSeriesChart: React.FC<MultiSeriesChartProps> = ({
  series,
  colors: seriesColors,
  height = 200,
  timeRange = '1h',
  formatValue = (v) => v.toFixed(2),
}) => {
  const [hover, setHover] = React.useState<{ x: number; index: number } | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  if (!series || series.length === 0 || series.every((s) => s.series.length === 0)) {
    return <div style={emptyChart}>No data</div>;
  }

  // Find global min/max across all series
  let allValues: number[] = [];
  let maxLen = 0;
  for (const s of series) {
    for (const dp of s.series) allValues.push(dp.value);
    if (s.series.length > maxLen) maxLen = s.series.length;
  }
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const chartWidth = 500;
  const chartHeight = height;
  const plotW = chartWidth - PADDING.left - PADDING.right;
  const plotH = chartHeight - PADDING.top - PADDING.bottom;

  // Y-axis ticks
  const yTicks = [minVal, minVal + range / 2, maxVal];
  const yPositions = [PADDING.top + plotH, PADDING.top + plotH / 2, PADDING.top];

  // Use first series for x-axis labels
  const refSeries = series[0].series;
  const xIndices = refSeries.length >= 3
    ? [0, Math.floor(refSeries.length / 2), refSeries.length - 1]
    : refSeries.map((_, i) => i);

  const toPoint = (val: number, idx: number, len: number) => ({
    x: PADDING.left + (idx / Math.max(len - 1, 1)) * plotW,
    y: PADDING.top + plotH - ((val - minVal) / range) * plotH,
  });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const relX = mouseX - PADDING.left;
    const idx = Math.round((relX / plotW) * (maxLen - 1));
    if (idx >= 0 && idx < maxLen) {
      setHover({ x: PADDING.left + (idx / Math.max(maxLen - 1, 1)) * plotW, index: idx });
    }
  };

  return (
    <div style={chartContainer}>
      {/* Legend */}
      <div style={legend}>
        {series.map((s, i) => (
          <div key={i} style={legendItem}>
            <span style={{ ...legendDot, background: seriesColors[i % seriesColors.length] }} />
            <span style={legendLabel}>{s.label}</span>
            {s.series.length > 0 && (
              <span style={legendValue}>
                {formatValue(hover !== null && hover.index < s.series.length
                  ? s.series[hover.index].value
                  : s.series[s.series.length - 1].value)}
              </span>
            )}
          </div>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid */}
        {yPositions.map((y, i) => (
          <line key={i} x1={PADDING.left} y1={y} x2={PADDING.left + plotW} y2={y}
            stroke={colors.gray200} strokeWidth={1} strokeDasharray="2,2" />
        ))}

        {/* Series lines */}
        {series.map((s, si) => {
          if (s.series.length === 0) return null;
          const pts = s.series.map((dp, i) => toPoint(dp.value, i, s.series.length));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          const color = seriesColors[si % seriesColors.length];
          return (
            <g key={si}>
              <path d={`${path} L${pts[pts.length - 1].x},${PADDING.top + plotH} L${pts[0].x},${PADDING.top + plotH} Z`}
                fill={color} opacity={0.06} />
              <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
            </g>
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((val, i) => (
          <text key={i} x={PADDING.left - 6} y={yPositions[i] + 3} textAnchor="end" style={axisLabel}>
            {formatValue(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xIndices.map((idx) => {
          if (idx >= refSeries.length) return null;
          const x = PADDING.left + (idx / Math.max(refSeries.length - 1, 1)) * plotW;
          return (
            <text key={idx} x={x} y={chartHeight - 4} textAnchor="middle" style={axisLabel}>
              {formatTimeLabel(refSeries[idx].time, timeRange || '1h')}
            </text>
          );
        })}

        {/* Hover line */}
        {hover !== null && (
          <line x1={hover.x} y1={PADDING.top} x2={hover.x} y2={PADDING.top + plotH}
            stroke={colors.gray400} strokeWidth={1} strokeDasharray="2,2" />
        )}
      </svg>
    </div>
  );
};

const chartContainer: React.CSSProperties = {
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: spacing[3],
};

const emptyChart: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 100,
  fontSize: fontSize.sm,
  color: colors.gray400,
  background: colors.gray50,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
};

const legend: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing[3],
  marginBottom: spacing[2],
};

const legendItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
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

const legendValue: React.CSSProperties = {
  fontWeight: 600,
  color: colors.gray800,
  marginLeft: 2,
};

const axisLabel: React.CSSProperties = {
  fontSize: 9,
  fontFamily: fonts.mono,
  fill: colors.gray400,
};
