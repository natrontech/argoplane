import {
  ArgoPlaneAppView,
  createArgoPlaneResourceTab,
  getRegisteredResourceTypes,
  RESOURCE_TAB_EVENT,
} from '@argoplane/shared';

((window: any) => {
  // Consolidated app view (single icon in the app toolbar)
  window.extensionsAPI.registerAppViewExtension(
    ArgoPlaneAppView,
    'ArgoPlane',
    'fa-puzzle-piece'
  );

  // Consolidated resource tabs: register one "ArgoPlane" tab per resource type
  // that has extension tabs registered via registerArgoPlaneResourceTab.
  // Tracked on window so a duplicate bundle injection never double-registers
  // the same group/kind with ArgoCD.
  const registered: Set<string> =
    window.__argoplane_registered_resource_types ||
    (window.__argoplane_registered_resource_types = new Set<string>());

  const registerWithArgoCD = (group: string, kind: string) => {
    const key = `${group}/${kind}`;
    if (registered.has(key)) return;
    registered.add(key);
    window.extensionsAPI.registerResourceExtension(
      createArgoPlaneResourceTab(group, kind),
      group,
      kind,
      'ArgoPlane',
      { icon: 'fa-puzzle-piece' }
    );
  };

  // Register resource types from bundles that loaded before this one...
  for (const { group, kind } of getRegisteredResourceTypes()) {
    registerWithArgoCD(group, kind);
  }

  // ...and pick up bundles that load after, via the registration event.
  window.addEventListener(RESOURCE_TAB_EVENT, (e: Event) => {
    const detail = (e as CustomEvent).detail as { group?: string; kind?: string } | undefined;
    if (detail && typeof detail.kind === 'string') {
      registerWithArgoCD(detail.group || '', detail.kind);
    }
  });
})(window);
