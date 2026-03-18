import { registerArgoPlaneView, registerArgoPlaneResourceTab } from '@argoplane/shared';
import { AppVulnerabilitiesView } from './components/AppVulnerabilitiesView';
import { DeploymentVulnerabilitiesTab } from './components/DeploymentVulnerabilitiesTab';
import { PodVulnerabilitiesTab } from './components/PodVulnerabilitiesTab';

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'vulnerabilities',
  title: 'Vulnerabilities',
  icon: 'fa-shield-alt',
  component: AppVulnerabilitiesView,
});

// Register resource tabs via ArgoPlane consolidated resource tab
const deploymentEntry = {
  id: 'vulnerabilities',
  title: 'Vulnerabilities',
  icon: 'fa-shield-alt',
  component: DeploymentVulnerabilitiesTab,
};

registerArgoPlaneResourceTab('apps', 'Deployment', deploymentEntry);
registerArgoPlaneResourceTab('apps', 'StatefulSet', deploymentEntry);

registerArgoPlaneResourceTab('', 'Pod', {
  id: 'vulnerabilities',
  title: 'Vulnerabilities',
  icon: 'fa-shield-alt',
  component: PodVulnerabilitiesTab,
});
