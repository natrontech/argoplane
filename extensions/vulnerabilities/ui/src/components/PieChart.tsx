import * as React from 'react';
import { fonts, fontSize, fontWeight, spacing, colors } from '@argoplane/shared';

export interface PieSegment {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  segments: PieSegment[];
  size?: number;
}

export const PieChart: React.FC<PieChartProps> = ({ segments, size = 140 }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.55; // donut hole

  let startAngle = -Math.PI / 2;
  const paths = segments
    .filter(s => s.value > 0)
    .map(segment => {
      const angle = (segment.value / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;

      const x1 = cx + outerR * Math.cos(startAngle);
      const y1 = cy + outerR * Math.sin(startAngle);
      const x2 = cx + outerR * Math.cos(endAngle);
      const y2 = cy + outerR * Math.sin(endAngle);
      const x3 = cx + innerR * Math.cos(endAngle);
      const y3 = cy + innerR * Math.sin(endAngle);
      const x4 = cx + innerR * Math.cos(startAngle);
      const y4 = cy + innerR * Math.sin(startAngle);

      const d = [
        `M ${x1} ${y1}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z',
      ].join(' ');

      startAngle = endAngle;
      return { ...segment, d };
    });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[5] }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 20, fontWeight: 600, fontFamily: fonts.mono, fill: colors.gray800 }}>
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 10, fontFamily: fonts.body, fill: colors.gray500 }}>
          total
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
        {segments.filter(s => s.value > 0).map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
            <span style={{ width: 8, height: 8, borderRadius: 1, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: fontSize.xs, fontFamily: fonts.mono, color: colors.gray600 }}>
              {s.value}
            </span>
            <span style={{ fontSize: fontSize.xs, color: colors.gray500 }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
