import * as React from 'react';
import { registerArgoPlaneView } from '@argoplane/shared';
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

((window: any) => {
  // Deployment resource tab: vulnerability overview for all pods in the deployment
  window.extensionsAPI.registerResourceExtension(
    DeploymentVulnerabilitiesTab,
    'apps',
    'Deployment',
    'Vulnerabilities',
    { icon: 'fa-shield-alt' }
  );

  // StatefulSet resource tab
  window.extensionsAPI.registerResourceExtension(
    DeploymentVulnerabilitiesTab,
    'apps',
    'StatefulSet',
    'Vulnerabilities',
    { icon: 'fa-shield-alt' }
  );

  // Pod resource tab: per-container vulnerability detail
  window.extensionsAPI.registerResourceExtension(
    PodVulnerabilitiesTab,
    '',
    'Pod',
    'Vulnerabilities',
    { icon: 'fa-shield-alt' }
  );
})(window);
