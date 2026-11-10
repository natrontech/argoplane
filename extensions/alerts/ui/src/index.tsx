import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { AppAlertsView } from './components/AppAlertsView';
import { AlertsPanel } from './components/AlertsPanel';
import { AlertsStatusPanel } from './components/AlertsStatusPanel';

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

// The header item opens the same view in ArgoCD's flyout.
(window as any).extensionsAPI?.registerStatusPanelExtension(
  AlertsStatusPanel,
  'Alerts',
  'argoplane_alerts',
  AppAlertsView,
);
