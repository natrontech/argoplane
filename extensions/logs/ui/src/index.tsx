import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { LogsPanel } from './components/LogsPanel';
import { AppLogsView } from './components/AppLogsView';

// registerArgoPlaneView/ResourceTab wrap each component in an error boundary.

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'logs',
  title: 'Log Explorer',
  icon: 'fa-search',
  component: AppLogsView,
});

// Register resource tabs via ArgoPlane consolidated resource tab
const entry = {
  id: 'logs',
  title: 'Log Explorer',
  icon: 'fa-search',
  component: LogsPanel,
};

registerArgoPlaneResourceTab('', 'Pod', entry);
registerArgoPlaneResourceTab('apps', 'Deployment', entry);
registerArgoPlaneResourceTab('apps', 'StatefulSet', entry);
