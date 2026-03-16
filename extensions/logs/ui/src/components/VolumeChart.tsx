import * as React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fonts } from '@argoplane/shared';
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
      height: 80,
      padding: '8px 12px',
      backgroundColor: '#111118',
      borderBottom: '1px solid #1e1e1e',
    }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: '#6e6e6e', fontFamily: fonts.mono }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              fontFamily: fonts.mono,
              fontSize: '11px',
              backgroundColor: '#1a1a2e',
              border: '1px solid #2a2a3a',
              borderRadius: 4,
              padding: '4px 8px',
              color: '#e0e0e0',
            }}
            cursor={{ fill: 'rgba(110, 159, 255, 0.08)' }}
            formatter={(value: number) => [`${value} lines`, 'Volume']}
            labelStyle={{ color: '#8e8e8e' }}
          />
          <Bar dataKey="value" fill="#4dbd74" radius={[1, 1, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
