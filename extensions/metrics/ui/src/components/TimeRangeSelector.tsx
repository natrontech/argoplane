import * as React from 'react';
import { Button } from '@argoplane/shared';
import { TimeRange } from '../types';

const ranges: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '6h', label: '6H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
];

export const TimeRangeSelector: React.FC<{
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}> = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {ranges.map((r) => (
      <Button
        key={r.value}
        primary={r.value === value}
        onClick={() => onChange(r.value)}
      >
        {r.label}
      </Button>
    ))}
  </div>
);
