import { ArgoPlaneAppView } from '@argoplane/shared';

((window: any) => {
  window.extensionsAPI.registerAppViewExtension(
    ArgoPlaneAppView,
    'ArgoPlane',
    'fa-puzzle-piece'
  );
})(window);
