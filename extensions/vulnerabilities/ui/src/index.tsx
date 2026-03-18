import { registerArgoPlaneView } from '@argoplane/shared';
import { AppVulnerabilitiesView } from './components/AppVulnerabilitiesView';
import { AppConfigAuditView } from './components/AppConfigAuditView';

// Register app views via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'vulnerabilities',
  title: 'Vulnerabilities',
  icon: 'fa-shield-alt',
  component: AppVulnerabilitiesView,
});

registerArgoPlaneView({
  id: 'config-audit',
  title: 'Config Audit',
  icon: 'fa-clipboard-check',
  component: AppConfigAuditView,
});
