import * as React from 'react';
import { AppNetworkingView } from './components/AppNetworkingView';
import { PodFlowsTab } from './components/PodFlowsTab';
import { PolicyFlowsTab } from './components/PolicyFlowsTab';
import { NetworkingStatusPanel } from './components/NetworkingStatusPanel';

((window: any) => {
  // App-level networking view (flows + policies + allowed traffic)
  window.extensionsAPI.registerAppViewExtension(
    AppNetworkingView,
    'Networking',
    'fa-shield-alt'
  );

  // Status panel: compact flow stats in the app header
  window.extensionsAPI.registerStatusPanelExtension(
    NetworkingStatusPanel,
    'Networking',
    'networking'
  );

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
