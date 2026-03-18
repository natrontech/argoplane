import { registerArgoPlaneView } from '@argoplane/shared';
import { AppVulnerabilitiesView } from './components/AppVulnerabilitiesView';
import { AppConfigAuditView } from './components/AppConfigAuditView';
import { AppExposedSecretsView } from './components/AppExposedSecretsView';
import { AppSbomView } from './components/AppSbomView';

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

registerArgoPlaneView({
  id: 'exposed-secrets',
  title: 'Exposed Secrets',
  icon: 'fa-key',
  component: AppExposedSecretsView,
});

registerArgoPlaneView({
  id: 'sbom',
  title: 'SBOM',
  icon: 'fa-list-alt',
  component: AppSbomView,
});
