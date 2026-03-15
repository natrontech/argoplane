import * as React from 'react';
import { MetricsPanel } from './components/MetricsPanel';
import { MetricsDashboard } from './components/MetricsDashboard';

((window: any) => {
  // Resource tab: Deployments
  window.extensionsAPI.registerResourceExtension(
    MetricsPanel,
    'apps',
    'Deployment',
    'Metrics',
    { icon: 'fa-chart-line' }
  );

  // Resource tab: StatefulSets
  window.extensionsAPI.registerResourceExtension(
    MetricsPanel,
    'apps',
    'StatefulSet',
    'Metrics',
    { icon: 'fa-chart-line' }
  );

  // Resource tab: Pods (core API group = empty string)
  window.extensionsAPI.registerResourceExtension(
    MetricsPanel,
    '',
    'Pod',
    'Metrics',
    { icon: 'fa-chart-line' }
  );

  // System-level sidebar page: Cluster Metrics Dashboard
  window.extensionsAPI.registerSystemLevelExtension(
    MetricsDashboard,
    'Metrics',
    'metrics',
    'fa-chart-line'
  );
})(window);
