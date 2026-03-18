import { ArgoPlaneAppView, createArgoPlaneResourceTab, getRegisteredResourceTypes } from '@argoplane/shared';

((window: any) => {
  // Consolidated app view (single icon in the app toolbar)
  window.extensionsAPI.registerAppViewExtension(
    ArgoPlaneAppView,
    'ArgoPlane',
    'fa-puzzle-piece'
  );

  // Consolidated resource tabs: register one "ArgoPlane" tab per resource type
  // that has multiple extension tabs registered via registerArgoPlaneResourceTab.
  // Uses a short delay to allow all extensions to register their tabs first.
  setTimeout(() => {
    const resourceTypes = getRegisteredResourceTypes();
    for (const { group, kind } of resourceTypes) {
      const component = createArgoPlaneResourceTab(group, kind);
      window.extensionsAPI.registerResourceExtension(
        component,
        group,
        kind,
        'ArgoPlane',
        { icon: 'fa-puzzle-piece' }
      );
    }
  }, 0);
})(window);
