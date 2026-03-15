import * as React from 'react';
import { AppNetworkingView } from './components/AppNetworkingView';

((window: any) => {
  window.extensionsAPI.registerAppViewExtension(
    AppNetworkingView,
    'Networking',
    'fa-network-wired'
  );
})(window);
