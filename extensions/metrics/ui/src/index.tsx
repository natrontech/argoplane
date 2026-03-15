import * as React from 'react';
import { MetricsPanel } from './components/MetricsPanel';

((window: any) => {
  // Register as a resource tab extension for Deployments
  window.extensionsAPI.registerResourceExtension(
    MetricsPanel,
    'apps',          // API group
    'Deployment',    // Resource kind
    'Metrics',       // Tab title
    { icon: 'fa-chart-line' }
  );

  // Also register for StatefulSets
  window.extensionsAPI.registerResourceExtension(
    MetricsPanel,
    'apps',
    'StatefulSet',
    'Metrics',
    { icon: 'fa-chart-line' }
  );
})(window);
