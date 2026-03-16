import * as React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { VolumePoint } from '../types';

interface VolumeChartProps {
  data: VolumePoint[];
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const VolumeChart: React.FC<VolumeChartProps> = ({ data }) => {
  if (data.length === 0) return null;

  const chartData = data.map((p) => ({
    time: formatTime(p.time),
    value: p.value,
  }));

  return (
    <div style={{
      height: 64,
      padding: `${spacing[1]}px ${spacing[3]}px`,
      borderBottom: `1px solid ${colors.gray200}`,
      backgroundColor: colors.gray50,
    }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: colors.gray500, fontFamily: fonts.mono }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              fontFamily: fonts.mono,
              fontSize: fontSize.xs,
              border: `1px solid ${colors.gray200}`,
              borderRadius: 4,
              padding: `${spacing[1]}px ${spacing[2]}px`,
              backgroundColor: colors.white,
            }}
            cursor={{ fill: `${colors.gray200}44` }}
            formatter={(value: number) => [`${value} lines`, 'Volume']}
          />
          <Bar dataKey="value" fill={colors.greenSolid} radius={[1, 1, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
