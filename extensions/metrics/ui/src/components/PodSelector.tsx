import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing, radius } from '@argoplane/shared';

interface PodSelectorProps {
  pods: string[];
  selected: string[]; // empty = all pods
  onChange: (selected: string[]) => void;
}

export const PodSelector: React.FC<PodSelectorProps> = ({ pods, selected, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const allSelected = selected.length === 0 || selected.length === pods.length;

  // Close dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const togglePod = (pod: string) => {
    if (allSelected) {
      // Switch from "all" to just this one pod
      onChange([pod]);
    } else if (selected.includes(pod)) {
      const next = selected.filter((p) => p !== pod);
      // If nothing left, go back to "all"
      onChange(next.length === 0 ? [] : next);
    } else {
      const next = [...selected, pod];
      // If all pods are now selected, go back to "all"
      onChange(next.length === pods.length ? [] : next);
    }
  };

  const selectAll = () => {
    onChange([]);
    setOpen(false);
  };

  if (pods.length <= 1) return null;

  return (
    <div ref={ref} style={container}>
      {/* Chips */}
      <div style={chipRow}>
        {allSelected ? (
          <button style={chip} onClick={() => setOpen(!open)}>
            All Pods ({pods.length})
            <span style={chevron}>{open ? '\u25B2' : '\u25BC'}</span>
          </button>
        ) : (
          <>
            {selected.map((pod) => (
              <button key={pod} style={chipSelected} onClick={() => togglePod(pod)}>
                {shortName(pod)}
                <span style={chipX}>\u00D7</span>
              </button>
            ))}
            <button style={chipAdd} onClick={() => setOpen(!open)}>
              {open ? '\u25B2' : '+'}
            </button>
          </>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={dropdown}>
          <button
            style={allSelected ? dropItemActive : dropItem}
            onClick={selectAll}
          >
            <span style={checkbox}>{allSelected ? '\u2611' : '\u2610'}</span>
            All Pods
          </button>
          {pods.map((pod) => {
            const checked = allSelected || selected.includes(pod);
            return (
              <button
                key={pod}
                style={checked && !allSelected ? dropItemActive : dropItem}
                onClick={() => togglePod(pod)}
              >
                <span style={checkbox}>{checked ? '\u2611' : '\u2610'}</span>
                {shortName(pod)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** Strip common deployment prefix to save space in chips */
function shortName(pod: string): string {
  // Show last two segments for readability (e.g., "abc12-xyz45" from "my-app-abc12-xyz45")
  const parts = pod.split('-');
  if (parts.length > 3) {
    return parts.slice(-2).join('-');
  }
  return pod;
}

// --- Styles ---

const container: React.CSSProperties = {
  position: 'relative',
};

const chipRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing[1],
  alignItems: 'center',
};

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: colors.gray100,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  color: colors.gray600,
  cursor: 'pointer',
};

const chipSelected: React.CSSProperties = {
  ...chip,
  background: `${colors.orange500}18`,
  borderColor: colors.orange500,
  color: colors.orange600,
};

const chipX: React.CSSProperties = {
  fontSize: fontSize.sm,
  lineHeight: '1',
  marginLeft: 2,
};

const chipAdd: React.CSSProperties = {
  ...chip,
  padding: `${spacing[1]}px ${spacing[1]}px`,
  color: colors.gray400,
};

const chevron: React.CSSProperties = {
  fontSize: '8px',
  marginLeft: 2,
};

const dropdown: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: spacing[1],
  background: colors.white,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  zIndex: 100,
  minWidth: 200,
  maxHeight: 240,
  overflowY: 'auto',
};

const dropItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing[2],
  width: '100%',
  padding: `${spacing[2]}px ${spacing[3]}px`,
  border: 'none',
  background: 'none',
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  color: colors.gray600,
  cursor: 'pointer',
  textAlign: 'left',
};

const dropItemActive: React.CSSProperties = {
  ...dropItem,
  color: colors.orange600,
  fontWeight: fontWeight.semibold,
};

const checkbox: React.CSSProperties = {
  fontSize: fontSize.sm,
  lineHeight: '1',
};
