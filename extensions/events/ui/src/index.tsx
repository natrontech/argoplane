import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { EventsPanel } from './components/EventsPanel';
import { AppEventsView } from './components/AppEventsView';

// registerArgoPlaneView/ResourceTab wrap each component in an error boundary.

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'events',
  title: 'Events',
  icon: 'fa-bell',
  component: AppEventsView,
});

// Register resource tabs via ArgoPlane consolidated resource tab
const entry = {
  id: 'events',
  title: 'Events',
  icon: 'fa-bell',
  component: EventsPanel,
};

registerArgoPlaneResourceTab('', 'Pod', entry);
registerArgoPlaneResourceTab('apps', 'Deployment', entry);
registerArgoPlaneResourceTab('apps', 'StatefulSet', entry);
registerArgoPlaneResourceTab('apps', 'ReplicaSet', entry);
registerArgoPlaneResourceTab('apps', 'DaemonSet', entry);
registerArgoPlaneResourceTab('batch', 'Job', entry);
registerArgoPlaneResourceTab('batch', 'CronJob', entry);
