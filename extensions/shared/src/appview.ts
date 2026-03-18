import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing } from './theme';

// --- Types ---

export interface ArgoPlaneViewEntry {
  id: string;
  title: string;
  icon: string;
  component: React.ComponentType<{ application: any; tree?: any }>;
}

// --- Global registry ---

const GLOBAL_KEY = '__argoplane_views';
const EVENT_NAME = 'argoplane-view-registered';

function getViews(): ArgoPlaneViewEntry[] {
  return (window as any)[GLOBAL_KEY] || [];
}

export function registerArgoPlaneView(entry: ArgoPlaneViewEntry): void {
  const win = window as any;
  if (!win[GLOBAL_KEY]) {
    win[GLOBAL_KEY] = [];
  }
  win[GLOBAL_KEY].push(entry);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

// --- Tab ordering ---

const TAB_ORDER: Record<string, number> = {
  metrics: 1,
  logs: 2,
  backups: 3,
  networking: 4,
  vulnerabilities: 5,
  'config-audit': 6,
};

function sortViews(views: ArgoPlaneViewEntry[]): ArgoPlaneViewEntry[] {
  return [...views].sort((a, b) => {
    const orderA = TAB_ORDER[a.id] ?? 100;
    const orderB = TAB_ORDER[b.id] ?? 100;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });
}

// --- Error boundary for individual tabs ---

interface TabErrorBoundaryProps {
  tabId: string;
  children?: React.ReactNode;
}

class TabErrorBoundary extends React.Component<
  TabErrorBoundaryProps,
  { error: Error | null }
> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ArgoPlane ${this.props.tabId}] render error:`, error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: {
          padding: 20,
          fontFamily: fonts.mono,
          fontSize: 12,
          color: '#B91C1C',
        },
      },
        React.createElement('div', { style: { fontWeight: 600, marginBottom: 8 } },
          `${this.props.tabId}: render error`),
        React.createElement('pre', {
          style: { whiteSpace: 'pre-wrap', color: colors.gray500, fontSize: 11 },
        }, this.state.error.message),
      );
    }
    return this.props.children;
  }
}

// --- Styles ---

const tabBar: React.CSSProperties = {
  display: 'flex',
  borderBottom: `1px solid ${colors.gray200}`,
  marginBottom: spacing[4],
  gap: 0,
};

const tabBase: React.CSSProperties = {
  padding: `${spacing[2]}px ${spacing[4]}px`,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  borderBottom: '2px solid transparent',
  color: colors.gray500,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  transition: 'color 0.1s, border-color 0.1s',
};

const tabActive: React.CSSProperties = {
  ...tabBase,
  color: colors.orange500,
  borderBottomColor: colors.orange500,
};

const tabHover: React.CSSProperties = {
  ...tabBase,
  color: colors.gray700,
};

// --- ArgoPlaneAppView ---

export const ArgoPlaneAppView: React.FC<{ application: any; tree?: any }> = (props) => {
  const [views, setViews] = React.useState<ArgoPlaneViewEntry[]>(() => sortViews(getViews()));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handler = () => setViews(sortViews(getViews()));
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  // Auto-select first tab if none active or active tab disappeared
  const resolvedActiveId = views.find((v) => v.id === activeId) ? activeId : views[0]?.id ?? null;
  const activeView = views.find((v) => v.id === resolvedActiveId);

  if (views.length === 0) {
    return React.createElement('div', {
      style: { padding: spacing[5], color: colors.gray400, fontSize: fontSize.sm },
    }, 'No ArgoPlane views registered.');
  }

  return React.createElement('div', null,
    // Tab bar
    React.createElement('div', { style: tabBar },
      views.map((view) => {
        const isActive = view.id === resolvedActiveId;
        const isHovered = view.id === hoveredId;
        return React.createElement('button', {
          key: view.id,
          style: isActive ? tabActive : isHovered ? tabHover : tabBase,
          onClick: () => setActiveId(view.id),
          onMouseEnter: () => setHoveredId(view.id),
          onMouseLeave: () => setHoveredId(null),
        },
          React.createElement('i', { className: `fa ${view.icon}`, style: { fontSize: 12 } }),
          view.title,
        );
      }),
    ),
    // Active tab content
    activeView && React.createElement(
      TabErrorBoundary,
      { key: resolvedActiveId, tabId: activeView.title, children: React.createElement(activeView.component, props) },
    ),
  );
};
