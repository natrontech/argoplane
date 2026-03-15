import * as React from 'react';
import { colors, fonts, spacing } from './theme';
import * as s from './styles';

// --- Status Badge ---
// 8x8 pixel square + label

export const StatusBadge: React.FC<{
  status: s.Status;
  label?: string;
  withBg?: boolean;
}> = ({ status, label, withBg }) => (
  <span style={withBg ? s.badgeWithBg(status) : s.badge}>
    <span style={s.badgeSquare(status)} />
    <span>{label || status}</span>
  </span>
);

// --- Section Header ---
// "BACKUPS ─────────────"

export const SectionHeader: React.FC<{
  title: string;
  action?: React.ReactNode;
}> = ({ title, action }) => (
  <div style={s.sectionHeader}>
    <span>{title}</span>
    <span style={s.sectionLine} />
    {action}
  </div>
);

// --- Pixel Decoration ---
// 2x2 dot cluster for card corners

export const PixelDots: React.FC = () => (
  <div style={s.pixelDots}>
    <span style={s.pixelDot} />
    <span style={s.pixelDot} />
    <span style={s.pixelDot} />
    <span style={s.pixelDot} />
  </div>
);

// --- Metric Card ---
// Compact value display with pixel decoration

export const MetricCard: React.FC<{
  label: string;
  value: string;
  unit?: string;
}> = ({ label, value, unit }) => (
  <div style={s.metricCard}>
    <PixelDots />
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={s.metricValue}>{value}</span>
      {unit && <span style={s.metricUnit}>{unit}</span>}
    </div>
    <span style={s.metricLabel}>{label}</span>
  </div>
);

// --- Button ---

export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}> = ({ children, onClick, disabled, primary, danger }) => {
  const baseStyle = disabled
    ? s.buttonDisabled
    : danger
      ? s.buttonDanger
      : primary
        ? s.buttonPrimary
        : s.button;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={baseStyle}
    >
      {children}
    </button>
  );
};

// --- Data Table ---

export const DataTable: React.FC<{
  columns: string[];
  children: React.ReactNode;
}> = ({ columns, children }) => (
  <table style={s.table}>
    <thead>
      <tr>
        {columns.map((col) => (
          <th key={col} style={s.th}>{col}</th>
        ))}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);

export const Cell: React.FC<{
  children: React.ReactNode;
  mono?: boolean;
  isLast?: boolean;
}> = ({ children, mono = true, isLast }) => (
  <td style={{
    ...(isLast ? s.tdLast : s.td),
    fontFamily: mono ? fonts.mono : 'inherit',
  }}>
    {children}
  </td>
);

// --- Empty State ---
// Pixel art dots + message

export const EmptyState: React.FC<{
  message: string;
}> = ({ message }) => (
  <div style={s.emptyState}>
    <div style={s.emptyIcon}>
      <span style={s.emptyPixel} />
      <span style={s.emptyPixel} />
      <span style={s.emptyPixel} />
      <span style={s.emptyPixel} />
    </div>
    <span style={s.emptyText}>{message}</span>
  </div>
);

// --- Loading ---
// Three squares that cycle

export const Loading: React.FC = () => {
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % 3);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={s.loadingContainer}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={s.loadingSquare(i === active)} />
      ))}
    </div>
  );
};

// --- Inline Meta ---
// "Namespace: default  ·  Status: Healthy"

export const MetaRow: React.FC<{
  items: Array<{ label: string; value: React.ReactNode }>;
}> = ({ items }) => (
  <div style={s.metaRow}>
    {items.map((item, i) => (
      <React.Fragment key={item.label}>
        {i > 0 && <span style={s.metaSeparator}>{'\u00B7'}</span>}
        <span>
          <span style={{ color: colors.gray400 }}>{item.label}: </span>
          <span style={{ color: colors.gray700 }}>{item.value}</span>
        </span>
      </React.Fragment>
    ))}
  </div>
);

// --- Card ---

export const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div style={{ ...s.card, ...style }}>
    {children}
  </div>
);

// --- Tag / Chip ---

export const Tag: React.FC<{
  children: React.ReactNode;
  variant?: s.TagVariant;
}> = ({ children, variant = 'gray' }) => (
  <span style={s.tag(variant)}>
    {children}
  </span>
);

// --- Progress Bar ---

export const ProgressBar: React.FC<{
  percent: number;
}> = ({ percent }) => (
  <div style={s.progress}>
    <div style={s.progressFill(percent)} />
  </div>
);

// --- Input ---

export const Input: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}> = ({ value, onChange, placeholder, style }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ ...s.input, ...style }}
  />
);
