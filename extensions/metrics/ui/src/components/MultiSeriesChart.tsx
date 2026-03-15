import * as React from 'react';
import { colors, fonts, fontSize, spacing, radius } from '@argoplane/shared';
import { formatTimeLabel } from '../utils/format';

interface AlignedSeries {
  label: string;
  values: number[]; // same length as timestamps, NaN for gaps
}

interface MultiSeriesChartProps {
  title?: string;
  unit?: string;
  timestamps: string[];
  series: AlignedSeries[];
  colors: string[];
  height?: number;
  timeRange?: string;
  formatValue?: (v: number) => string;
}

const PADDING = { top: 8, right: 12, bottom: 24, left: 60 };

export const MultiSeriesChart: React.FC<MultiSeriesChartProps> = ({
  title,
  unit,
  timestamps,
  series,
  colors: seriesColors,
  height = 200,
  timeRange = '1h',
  formatValue,
}) => {
  const fmt = formatValue || ((v: number) => {
    if (isNaN(v)) return '-';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    if (v === 0) return '0';
    if (Math.abs(v) < 0.1) return v.toFixed(3);
    return v.toFixed(1);
  });

  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const numPoints = timestamps.length;

  if (!series || series.length === 0 || numPoints === 0) {
    return <div style={emptyChart}>No data</div>;
  }

  // Find global min/max (ignoring NaN)
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const s of series) {
    for (const v of s.values) {
      if (!isNaN(v)) {
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }
    }
  }
  if (!isFinite(globalMin)) { globalMin = 0; globalMax = 1; }
  const valRange = globalMax - globalMin || 1;

  const chartWidth = 500;
  const chartHeight = height;
  const plotW = chartWidth - PADDING.left - PADDING.right;
  const plotH = chartHeight - PADDING.top - PADDING.bottom;

  const xForIdx = (i: number) => PADDING.left + (i / Math.max(numPoints - 1, 1)) * plotW;
  const yForVal = (v: number) => PADDING.top + plotH - ((v - globalMin) / valRange) * plotH;

  // Y-axis ticks
  const yTicks = [globalMin, globalMin + valRange / 2, globalMax];
  const yPositions = yTicks.map(yForVal);

  // X-axis labels
  const xIndices = numPoints >= 3
    ? [0, Math.floor(numPoints / 2), numPoints - 1]
    : Array.from({ length: numPoints }, (_, i) => i);

  // Build SVG paths for each series (skip NaN segments)
  const buildPath = (values: number[]): string => {
    let path = '';
    let drawing = false;
    for (let i = 0; i < values.length; i++) {
      if (isNaN(values[i])) {
        drawing = false;
        continue;
      }
      const x = xForIdx(i);
      const y = yForVal(values[i]);
      path += drawing ? `L${x},${y} ` : `M${x},${y} `;
      drawing = true;
    }
    return path;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const relX = mouseX - PADDING.left;
    const idx = Math.round((relX / plotW) * (numPoints - 1));
    if (idx >= 0 && idx < numPoints) setHoverIdx(idx);
  };

  return (
    <div style={chartContainer}>
      {title && (
        <div style={headerStyle}>
          <span style={titleStyle}>{title}</span>
          {unit && <span style={unitStyle}>{unit}</span>}
        </div>
      )}

      {/* Legend */}
      <div style={legend}>
        {series.map((s, i) => {
          const color = seriesColors[i % seriesColors.length];
          const val = hoverIdx !== null ? s.values[hoverIdx] : s.values[s.values.length - 1];
          return (
            <div key={s.label} style={legendItem}>
              <span style={{ ...legendDot, background: color }} />
              <span style={legendLabel}>{s.label}</span>
              <span style={legendValue}>{fmt(val)}</span>
            </div>
          );
        })}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid */}
        {yPositions.map((y, i) => (
          <line key={i} x1={PADDING.left} y1={y} x2={PADDING.left + plotW} y2={y}
            stroke={colors.gray200} strokeWidth={1} strokeDasharray="2,2" />
        ))}

        {/* Series */}
        {series.map((s, si) => {
          const path = buildPath(s.values);
          if (!path) return null;
          const color = seriesColors[si % seriesColors.length];
          return (
            <path key={si} d={path} fill="none" stroke={color} strokeWidth={1.5} />
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((val, i) => (
          <text key={i} x={PADDING.left - 6} y={yPositions[i] + 3} textAnchor="end" style={axisLabel}>
            {fmt(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xIndices.map((idx) => (
          <text key={idx} x={xForIdx(idx)} y={chartHeight - 4} textAnchor="middle" style={axisLabel}>
            {formatTimeLabel(timestamps[idx], timeRange || '1h')}
          </text>
        ))}

        {/* Hover line + dots */}
        {hoverIdx !== null && (
          <>
            <line x1={xForIdx(hoverIdx)} y1={PADDING.top} x2={xForIdx(hoverIdx)} y2={PADDING.top + plotH}
              stroke={colors.gray400} strokeWidth={1} strokeDasharray="2,2" />
            {series.map((s, si) => {
              const v = s.values[hoverIdx];
              if (isNaN(v)) return null;
              return (
                <circle key={si} cx={xForIdx(hoverIdx)} cy={yForVal(v)} r={3}
                  fill={seriesColors[si % seriesColors.length]} stroke={colors.white} strokeWidth={1.5} />
              );
            })}
          </>
        )}
      </svg>
    </div>
  );
};

// --- Styles ---

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
