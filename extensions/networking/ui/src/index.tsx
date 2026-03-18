import * as React from 'react';
import { registerArgoPlaneView } from '@argoplane/shared';
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

((window: any) => {
  // Pod-level flows tab (flows affecting a specific pod)
  window.extensionsAPI.registerResourceExtension(
    PodFlowsTab,
    '',          // core API group
    'Pod',
    'Flows',
    { icon: 'fa-exchange-alt' }
  );

  // CiliumNetworkPolicy flows tab (flows affected by this policy)
  window.extensionsAPI.registerResourceExtension(
    PolicyFlowsTab,
    'cilium.io',
    'CiliumNetworkPolicy',
    'Flows',
    { icon: 'fa-exchange-alt' }
  );

  // CiliumClusterwideNetworkPolicy flows tab
  window.extensionsAPI.registerResourceExtension(
    PolicyFlowsTab,
    'cilium.io',
    'CiliumClusterwideNetworkPolicy',
    'Flows',
    { icon: 'fa-exchange-alt' }
  );
})(window);
