import * as React from 'react';
import { colors, fonts, fontSize, spacing } from '@argoplane/shared';
import { RelativeRange, TimeSelection, RELATIVE_LABELS } from '../types';

interface TimeRangePickerProps {
  value: TimeSelection;
  onChange: (sel: TimeSelection) => void;
}

const QUICK_RANGES: RelativeRange[] = [
  '5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '2d', '7d',
];

/** Format an ISO date string to local datetime-local input value */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Format display label for the current selection */
function displayLabel(sel: TimeSelection): string {
  if (sel.type === 'relative' && sel.relative) {
    return RELATIVE_LABELS[sel.relative] || sel.relative;
  }
  if (sel.type === 'absolute' && sel.from && sel.to) {
    const fmt = (iso: string) => {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    return `${fmt(sel.from)} - ${fmt(sel.to)}`;
  }
  return 'Last 1 hour';
}

export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'relative' | 'absolute'>('relative');
  const [customFrom, setCustomFrom] = React.useState('');
  const [customTo, setCustomTo] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  // Initialize custom fields when switching to absolute tab
  React.useEffect(() => {
    if (tab === 'absolute') {
      if (value.type === 'absolute' && value.from && value.to) {
        setCustomFrom(toLocalInput(value.from));
        setCustomTo(toLocalInput(value.to));
      } else {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        setCustomFrom(toLocalInput(oneHourAgo.toISOString()));
        setCustomTo(toLocalInput(now.toISOString()));
      }
    }
  }, [tab, value]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRelativeSelect = (range: RelativeRange) => {
    onChange({ type: 'relative', relative: range });
    setOpen(false);
  };

  const handleApplyAbsolute = () => {
    if (customFrom && customTo) {
      onChange({
        type: 'absolute',
        from: new Date(customFrom).toISOString(),
        to: new Date(customTo).toISOString(),
      });
      setOpen(false);
    }
  };

  const isActiveRelative = (range: RelativeRange) =>
    value.type === 'relative' && value.relative === range;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing[1],
          padding: `${spacing[1]}px ${spacing[2]}px`,
          border: `1px solid ${colors.gray200}`,
          borderRadius: 4,
          backgroundColor: open ? colors.gray100 : colors.white,
          color: colors.gray800,
          cursor: 'pointer',
          fontFamily: fonts.mono,
          fontSize: fontSize.xs,
          whiteSpace: 'nowrap',
          transition: 'background-color 100ms',
        }}
      >
        {/* Clock icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="6.5" stroke={colors.gray500} strokeWidth="1.5" />
          <path d="M8 4.5V8L10.5 10" stroke={colors.gray500} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {displayLabel(value)}
        {/* Chevron */}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1.5 3L4 5.5L6.5 3" stroke={colors.gray400} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: spacing[1],
          width: 280,
          backgroundColor: colors.white,
          border: `1px solid ${colors.gray200}`,
          borderRadius: 4,
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: `1px solid ${colors.gray200}`,
          }}>
            {(['relative', 'absolute'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: `${spacing[2]}px 0`,
                  border: 'none',
                  borderBottom: tab === t ? `2px solid ${colors.orange500}` : '2px solid transparent',
                  backgroundColor: 'transparent',
                  color: tab === t ? colors.gray800 : colors.gray500,
                  cursor: 'pointer',
                  fontFamily: fonts.mono,
                  fontSize: fontSize.xs,
                  fontWeight: tab === t ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Relative tab: quick range list */}
          {tab === 'relative' && (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {QUICK_RANGES.map((range) => (
                <button
                  key={range}
                  onClick={() => handleRelativeSelect(range)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: `${spacing[2]}px ${spacing[3]}px`,
                    border: 'none',
                    backgroundColor: isActiveRelative(range) ? colors.orange50 : 'transparent',
                    color: isActiveRelative(range) ? colors.orange600 : colors.gray800,
                    cursor: 'pointer',
                    fontFamily: fonts.mono,
                    fontSize: fontSize.xs,
                    textAlign: 'left',
                    transition: 'background-color 100ms',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActiveRelative(range)) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = colors.gray50;
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      isActiveRelative(range) ? colors.orange50 : 'transparent';
                  }}
                >
                  {RELATIVE_LABELS[range]}
                </button>
              ))}
            </div>
          )}

          {/* Absolute tab: from/to datetime inputs */}
          {tab === 'absolute' && (
            <div style={{ padding: spacing[3] }}>
              <label style={{
                display: 'block',
                fontFamily: fonts.mono,
                fontSize: '10px',
                color: colors.gray500,
                marginBottom: spacing[1],
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}>
                From
              </label>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: `${spacing[1]}px ${spacing[2]}px`,
                  border: `1px solid ${colors.gray200}`,
                  borderRadius: 4,
                  backgroundColor: colors.white,
                  color: colors.gray800,
                  fontFamily: fonts.mono,
                  fontSize: fontSize.xs,
                  outline: 'none',
                  marginBottom: spacing[3],
                  boxSizing: 'border-box',
                }}
              />
              <label style={{
                display: 'block',
                fontFamily: fonts.mono,
                fontSize: '10px',
                color: colors.gray500,
                marginBottom: spacing[1],
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}>
                To
              </label>
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: `${spacing[1]}px ${spacing[2]}px`,
                  border: `1px solid ${colors.gray200}`,
                  borderRadius: 4,
                  backgroundColor: colors.white,
                  color: colors.gray800,
                  fontFamily: fonts.mono,
                  fontSize: fontSize.xs,
                  outline: 'none',
                  marginBottom: spacing[3],
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleApplyAbsolute}
                disabled={!customFrom || !customTo}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: `${spacing[2]}px 0`,
                  border: 'none',
                  borderRadius: 4,
                  backgroundColor: (!customFrom || !customTo) ? colors.gray200 : colors.orange500,
                  color: (!customFrom || !customTo) ? colors.gray500 : colors.white,
                  cursor: (!customFrom || !customTo) ? 'not-allowed' : 'pointer',
                  fontFamily: fonts.mono,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                }}
              >
                Apply time range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
