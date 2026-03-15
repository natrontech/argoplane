import * as React from 'react';
import { NetworkingPanel } from './components/NetworkingPanel';

((window: any) => {
  window.extensionsAPI.registerResourceExtension(
    NetworkingPanel,
    'apps',
    'Deployment',
    'Networking',
    { icon: 'fa-network-wired' }
  );

  window.extensionsAPI.registerResourceExtension(
    NetworkingPanel,
    'apps',
    'StatefulSet',
    'Networking',
    { icon: 'fa-network-wired' }
  );

  window.extensionsAPI.registerResourceExtension(
    NetworkingPanel,
    'apps',
    'DaemonSet',
    'Networking',
    { icon: 'fa-network-wired' }
  );
})(window);
