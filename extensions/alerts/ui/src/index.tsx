import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { AppAlertsView } from './components/AppAlertsView';
import { AlertsPanel } from './components/AlertsPanel';

registerArgoPlaneView({
  id: 'alerts',
  title: 'Alerts',
  icon: 'fa-exclamation-triangle',
  component: AppAlertsView,
});

const entry = {
  id: 'alerts',
  title: 'Alerts',
  icon: 'fa-exclamation-triangle',
  component: AlertsPanel,
};

registerArgoPlaneResourceTab('', 'Pod', entry);
registerArgoPlaneResourceTab('apps', 'Deployment', entry);
registerArgoPlaneResourceTab('apps', 'StatefulSet', entry);
registerArgoPlaneResourceTab('apps', 'DaemonSet', entry);
registerArgoPlaneResourceTab('batch', 'Job', entry);
