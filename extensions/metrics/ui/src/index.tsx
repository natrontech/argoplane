import * as React from 'react';
import { MetricsPanel } from './components/MetricsPanel';
import { AppMetricsView } from './components/AppMetricsView';

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

  // Resource tab: Pods (core API group)
  window.extensionsAPI.registerResourceExtension(
    MetricsPanel,
    '',
    'Pod',
    'Metrics',
    { icon: 'fa-chart-line' }
  );

  // App view: application-level metrics with query builder
  window.extensionsAPI.registerAppViewExtension(
    AppMetricsView,
    'Metrics',
    'fa-chart-line'
  );
})(window);
