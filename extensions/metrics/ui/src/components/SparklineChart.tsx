import * as React from 'react';
import { colors, fonts, fontSize, spacing, radius } from '@argoplane/shared';
import { DataPoint } from '../types';
import { formatCompact, formatTimeLabel } from '../utils/format';

interface SparklineChartProps {
  title: string;
  unit: string;
  data: DataPoint[];
  color?: string;
  height?: number;
  timeRange?: string;
}

const PADDING = { top: 8, right: 12, bottom: 24, left: 52 };

export const SparklineChart: React.FC<SparklineChartProps> = ({
  title,
  unit,
  data,
  color = colors.orange500,
  height = 120,
  timeRange = '1h',
}) => {
  const [hover, setHover] = React.useState<{ x: number; index: number } | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  if (!data || data.length === 0) {
    return (
      <div style={chartContainer}>
        <div style={chartHeader}>
          <span style={chartTitle}>{title}</span>
          <span style={chartUnit}>{unit}</span>
        </div>
        <div style={{ ...noData, height }}>No data</div>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const chartWidth = 400;
  const chartHeight = height;
  const plotW = chartWidth - PADDING.left - PADDING.right;
  const plotH = chartHeight - PADDING.top - PADDING.bottom;

  const points = data.map((d, i) => {
    const x = PADDING.left + (i / (data.length - 1)) * plotW;
    const y = PADDING.top + plotH - ((d.value - minVal) / range) * plotH;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${PADDING.top + plotH} L${points[0].x},${PADDING.top + plotH} Z`;

  // Y-axis labels (3 ticks)
  const yTicks = [minVal, minVal + range / 2, maxVal];
  const yPositions = [PADDING.top + plotH, PADDING.top + plotH / 2, PADDING.top];

  // X-axis labels (start, mid, end)
  const xIndices = [0, Math.floor(data.length / 2), data.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const relX = mouseX - PADDING.left;
    const idx = Math.round((relX / plotW) * (data.length - 1));
    if (idx >= 0 && idx < data.length) {
      setHover({ x: points[idx].x, index: idx });
    }
  };

  const currentValue = hover !== null ? data[hover.index] : data[data.length - 1];

  return (
    <div style={chartContainer}>
      <div style={chartHeader}>
        <span style={chartTitle}>{title}</span>
        <span style={chartCurrentValue}>
          {formatCompact(currentValue.value, unit)}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines */}
        {yPositions.map((y, i) => (
          <line
            key={i}
            x1={PADDING.left}
            y1={y}
            x2={PADDING.left + plotW}
            y2={y}
            stroke={colors.gray200}
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity={0.08} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} />

        {/* Y-axis labels */}
        {yTicks.map((val, i) => (
          <text
            key={i}
            x={PADDING.left - 6}
            y={yPositions[i] + 3}
            textAnchor="end"
            style={axisLabel}
          >
            {formatCompact(val, unit)}
          </text>
        ))}

        {/* X-axis labels */}
        {xIndices.map((idx) => (
          <text
            key={idx}
            x={points[idx].x}
            y={chartHeight - 4}
            textAnchor="middle"
            style={axisLabel}
          >
            {formatTimeLabel(data[idx].time, timeRange)}
          </text>
        ))}

        {/* Hover indicator */}
        {hover !== null && (
          <>
            <line
              x1={hover.x}
              y1={PADDING.top}
              x2={hover.x}
              y2={PADDING.top + plotH}
              stroke={colors.gray400}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            <circle
              cx={hover.x}
              cy={points[hover.index].y}
              r={3}
              fill={color}
              stroke={colors.white}
              strokeWidth={1.5}
            />
          </>
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
  position: 'relative',
};

const chartHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: spacing[2],
};

const chartTitle: React.CSSProperties = {
  fontSize: fontSize.xs,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  color: colors.gray500,
};

const chartUnit: React.CSSProperties = {
  fontSize: fontSize.xs,
  color: colors.gray400,
  fontFamily: fonts.mono,
};

const chartCurrentValue: React.CSSProperties = {
  fontSize: fontSize.lg,
  fontWeight: 600,
  fontFamily: fonts.mono,
  color: colors.gray800,
};

const noData: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: fontSize.sm,
  color: colors.gray400,
};

const axisLabel: React.CSSProperties = {
  fontSize: 9,
  fontFamily: fonts.mono,
  fill: colors.gray400,
};
