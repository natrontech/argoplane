import * as React from 'react';
import { AppNetworkingView } from './components/AppNetworkingView';
import { PodFlowsTab } from './components/PodFlowsTab';

((window: any) => {
  // App-level networking view (flows + policies)
  window.extensionsAPI.registerAppViewExtension(
    AppNetworkingView,
    'Networking',
    'fa-shield-alt'
  );

  // Pod-level flows tab (flows affecting a specific pod)
  window.extensionsAPI.registerResourceExtension(
    PodFlowsTab,
    '',          // core API group
    'Pod',
    'Flows',
    { icon: 'fa-exchange-alt' }
  );
})(window);
