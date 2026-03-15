import * as React from 'react';
import { MetricsPanel } from './components/MetricsPanel';
import { MetricsStatusPanel, MetricsFlyout } from './components/MetricsStatusPanel';

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

  // Status panel: compact CPU/Memory on each app's status bar
  window.extensionsAPI.registerStatusPanelExtension(
    MetricsStatusPanel,
    'Metrics',
    'metrics',
    MetricsFlyout
  );
})(window);
