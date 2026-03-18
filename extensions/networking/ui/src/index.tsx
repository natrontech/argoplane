import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { AppNetworkingView } from './components/AppNetworkingView';
import { PodFlowsTab } from './components/PodFlowsTab';
import { PolicyFlowsTab } from './components/PolicyFlowsTab';

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'networking',
  title: 'Networking',
  icon: 'fa-shield-alt',
  component: AppNetworkingView,
});

// Register Pod flows via ArgoPlane consolidated resource tab
registerArgoPlaneResourceTab('', 'Pod', {
  id: 'networking',
  title: 'Flows',
  icon: 'fa-exchange-alt',
  component: PodFlowsTab,
});

// CiliumNetworkPolicy and CiliumClusterwideNetworkPolicy only have one extension tab each,
// so register them directly with ArgoCD (no consolidation needed)
((window: any) => {
  window.extensionsAPI.registerResourceExtension(
    PolicyFlowsTab,
    'cilium.io',
    'CiliumNetworkPolicy',
    'Flows',
    { icon: 'fa-exchange-alt' }
  );

  window.extensionsAPI.registerResourceExtension(
    PolicyFlowsTab,
    'cilium.io',
    'CiliumClusterwideNetworkPolicy',
    'Flows',
    { icon: 'fa-exchange-alt' }
  );
})(window);
