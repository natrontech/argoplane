import * as React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { colors, fonts, fontSize } from '@argoplane/shared';
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
      height: 44,
      padding: '4px 12px',
      borderBottom: `1px solid ${colors.gray200}`,
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
              padding: '4px 8px',
            }}
            formatter={(value: number) => [`${value} entries`, 'Volume']}
          />
          <Bar dataKey="value" fill={colors.gray500} radius={[1, 1, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
