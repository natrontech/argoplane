import * as React from 'react';
import { colors, fonts, fontSize, fontWeight, spacing, radius } from './theme';

// --- Types ---

export type Scope = 'app' | 'namespace';

interface ScopeToggleProps {
  value: Scope;
  onChange: (scope: Scope) => void;
}

// --- ScopeToggle component ---

export const ScopeToggle: React.FC<ScopeToggleProps> = ({ value, onChange }) => {
  return React.createElement('div', { style: container },
    React.createElement('button', {
      style: value === 'app' ? btnActive : btn,
      onClick: () => onChange('app'),
      title: 'Show data for this application only',
    }, 'Application'),
    React.createElement('button', {
      style: value === 'namespace' ? btnActive : btn,
      onClick: () => onChange('namespace'),
      title: 'Show data for the entire namespace',
    }, 'Namespace'),
  );
};

// --- Persistent scope hook ---

const SCOPE_STORAGE_KEY = 'argoplane-scope';

/** Use scope state that persists across ArgoCD UI refreshes via sessionStorage. */
export function useStickyScope(): [Scope, (s: Scope) => void] {
  const [scope, setScopeRaw] = React.useState<Scope>(() => {
    try {
      const stored = sessionStorage.getItem(SCOPE_STORAGE_KEY);
      if (stored === 'app' || stored === 'namespace') return stored;
    } catch {}
    return 'app';
  });

  const setScope = React.useCallback((s: Scope) => {
    setScopeRaw(s);
    try { sessionStorage.setItem(SCOPE_STORAGE_KEY, s); } catch {}
  }, []);

  return [scope, setScope];
}

// --- Tree extraction helpers ---

/** Extract pod names belonging to this app from the ArgoCD resource tree. */
export function extractPodNames(tree: any, namespace: string): string[] {
  if (!tree?.nodes) return [];
  return tree.nodes
    .filter((n: any) => n.kind === 'Pod' && n.namespace === namespace)
    .map((n: any) => n.name) as string[];
}

/** Extract workload names (Deployment, StatefulSet, DaemonSet, ReplicaSet, Job) from tree. */
export function extractWorkloadNames(tree: any, namespace: string): string[] {
  if (!tree?.nodes) return [];
  const workloadKinds = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);
  return tree.nodes
    .filter((n: any) => workloadKinds.has(n.kind) && n.namespace === namespace)
    .map((n: any) => n.name) as string[];
}

// --- Styles ---

const container: React.CSSProperties = {
  display: 'inline-flex',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  overflow: 'hidden',
};

const btn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: `${spacing[1]}px ${spacing[3]}px`,
  fontSize: fontSize.xs,
  fontFamily: fonts.mono,
  fontWeight: fontWeight.medium,
  color: colors.gray500,
  cursor: 'pointer',
  letterSpacing: '0.3px',
};

const btnActive: React.CSSProperties = {
  ...btn,
  background: colors.orange500,
  color: '#FFFFFF',
};
