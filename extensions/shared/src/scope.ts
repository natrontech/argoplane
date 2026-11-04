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

/**
 * Use scope state that persists across ArgoCD UI refreshes via sessionStorage.
 * Pass the extension name to keep a per-extension key; omitting it keeps the
 * legacy shared key for backward compatibility.
 */
export function useStickyScope(extension?: string): [Scope, (s: Scope) => void] {
  const storageKey = extension ? `${SCOPE_STORAGE_KEY}-${extension}` : SCOPE_STORAGE_KEY;

  const [scope, setScopeRaw] = React.useState<Scope>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored === 'app' || stored === 'namespace') return stored;
    } catch {}
    return 'app';
  });

  const setScope = React.useCallback((s: Scope) => {
    setScopeRaw(s);
    try { sessionStorage.setItem(storageKey, s); } catch {}
  }, [storageKey]);

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

const WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'ReplicationController', 'Job', 'CronJob']);

// Trivy Operator reports a pod with a built-in controller under that controller.
const isControlledPod = (n: any) =>
  n.kind === 'Pod' && (n.parentRefs || []).some((p: any) => WORKLOAD_KINDS.has(p.kind));

/**
 * Extract the names Trivy Operator labels image reports with: workload controllers,
 * plus pods no built-in controller owns (bare, or owned by a custom resource).
 */
export function extractWorkloadNames(tree: any, namespace: string): string[] {
  if (!tree?.nodes) return [];
  return tree.nodes
    .filter((n: any) => n.namespace === namespace && (WORKLOAD_KINDS.has(n.kind) || (n.kind === 'Pod' && !isControlledPod(n))))
    .map((n: any) => n.name) as string[];
}

/** Extract the names for config audit reports, which also cover Services, ConfigMaps, Roles and so on. */
export function extractAuditableNames(tree: any, namespace: string): string[] {
  if (!tree?.nodes) return [];
  return tree.nodes
    .filter((n: any) => n.namespace === namespace && !isControlledPod(n))
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
  color: colors.white,
};
