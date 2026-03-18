import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { MetricsPanel } from './components/MetricsPanel';
import { AppMetricsView } from './components/AppMetricsView';

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'metrics',
  title: 'Metrics',
  icon: 'fa-chart-line',
  component: AppMetricsView,
});

// Register resource tabs via ArgoPlane consolidated resource tab
const entry = {
  id: 'metrics',
  title: 'Metrics',
  icon: 'fa-chart-line',
  component: MetricsPanel,
};

registerArgoPlaneResourceTab('apps', 'Deployment', entry);
registerArgoPlaneResourceTab('apps', 'StatefulSet', entry);
registerArgoPlaneResourceTab('', 'Pod', entry);
