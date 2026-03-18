import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing } from './theme';

// --- Types ---

export interface ArgoPlaneResourceTabEntry {
  id: string;
  title: string;
  icon: string;
  component: React.ComponentType<any>;
}

/** Unique key for a Kubernetes resource type (group + kind). */
function resourceKey(group: string, kind: string): string {
  return `${group}/${kind}`;
}

// --- Global registry ---

const GLOBAL_KEY = '__argoplane_resource_tabs';
const EVENT_NAME = 'argoplane-resource-tab-registered';

interface ResourceTabRegistry {
  [resourceType: string]: ArgoPlaneResourceTabEntry[];
}

function getRegistry(): ResourceTabRegistry {
  return (window as any)[GLOBAL_KEY] || {};
}

function getTabsForResource(group: string, kind: string): ArgoPlaneResourceTabEntry[] {
  const registry = getRegistry();
  return registry[resourceKey(group, kind)] || [];
}

export function registerArgoPlaneResourceTab(
  group: string,
  kind: string,
  entry: ArgoPlaneResourceTabEntry,
): void {
  const win = window as any;
  if (!win[GLOBAL_KEY]) {
    win[GLOBAL_KEY] = {};
  }
  const key = resourceKey(group, kind);
  if (!win[GLOBAL_KEY][key]) {
    win[GLOBAL_KEY][key] = [];
  }
  win[GLOBAL_KEY][key].push(entry);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { group, kind } }));
}

/** Returns all resource types that have registered tabs. */
export function getRegisteredResourceTypes(): Array<{ group: string; kind: string }> {
  const registry = getRegistry();
  return Object.keys(registry).map((key) => {
    const [group, kind] = key.split('/');
    return { group, kind };
  });
}

// --- Tab ordering ---

const TAB_ORDER: Record<string, number> = {
  metrics: 1,
  logs: 2,
  backups: 3,
  networking: 4,
};

function sortTabs(tabs: ArgoPlaneResourceTabEntry[]): ArgoPlaneResourceTabEntry[] {
  return [...tabs].sort((a, b) => {
    const orderA = TAB_ORDER[a.id] ?? 100;
    const orderB = TAB_ORDER[b.id] ?? 100;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });
}

// --- Error boundary ---

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

// --- Styles (shared with appview.ts) ---

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

// --- Factory: create a consolidated resource tab component for a given resource type ---

export function createArgoPlaneResourceTab(
  group: string,
  kind: string,
): React.FC<any> {
  const ResourceTab: React.FC<any> = (props) => {
    const [tabs, setTabs] = React.useState<ArgoPlaneResourceTabEntry[]>(
      () => sortTabs(getTabsForResource(group, kind)),
    );
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [hoveredId, setHoveredId] = React.useState<string | null>(null);

    React.useEffect(() => {
      const handler = () => setTabs(sortTabs(getTabsForResource(group, kind)));
      window.addEventListener(EVENT_NAME, handler);
      return () => window.removeEventListener(EVENT_NAME, handler);
    }, []);

    const resolvedActiveId = tabs.find((t) => t.id === activeId) ? activeId : tabs[0]?.id ?? null;
    const activeTab = tabs.find((t) => t.id === resolvedActiveId);

    if (tabs.length === 0) {
      return React.createElement('div', {
        style: { padding: spacing[5], color: colors.gray400, fontSize: fontSize.sm },
      }, 'No ArgoPlane tabs registered.');
    }

    // If only one tab, render it directly without the sub-tab bar
    if (tabs.length === 1) {
      return React.createElement(
        TabErrorBoundary,
        { tabId: tabs[0].title },
        React.createElement(tabs[0].component, props),
      );
    }

    return React.createElement('div', null,
      // Sub-tab bar
      React.createElement('div', { style: tabBar },
        tabs.map((tab) => {
          const isActive = tab.id === resolvedActiveId;
          const isHovered = tab.id === hoveredId;
          return React.createElement('button', {
            key: tab.id,
            style: isActive ? tabActive : isHovered ? tabHover : tabBase,
            onClick: () => setActiveId(tab.id),
            onMouseEnter: () => setHoveredId(tab.id),
            onMouseLeave: () => setHoveredId(null),
          },
            React.createElement('i', { className: `fa ${tab.icon}`, style: { fontSize: 12 } }),
            tab.title,
          );
        }),
      ),
      // Active tab content
      activeTab && React.createElement(
        TabErrorBoundary,
        { key: resolvedActiveId, tabId: activeTab.title },
        React.createElement(activeTab.component, props),
      ),
    );
  };

  return ResourceTab;
}
