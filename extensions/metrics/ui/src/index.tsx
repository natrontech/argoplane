import * as React from 'react';
import { registerArgoPlaneView } from '@argoplane/shared';
import { MetricsPanel } from './components/MetricsPanel';
import { AppMetricsView } from './components/AppMetricsView';

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'metrics',
  title: 'Metrics',
  icon: 'fa-chart-line',
  component: AppMetricsView,
});

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
})(window);
