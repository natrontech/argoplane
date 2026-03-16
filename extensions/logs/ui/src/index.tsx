import * as React from 'react';
import { LogsPanel } from './components/LogsPanel';
import { AppLogsView } from './components/AppLogsView';


((window: any) => {
  // Resource tab: Pod logs (most common entry point)
  window.extensionsAPI.registerResourceExtension(
    LogsPanel,
    '',
    'Pod',
    'Logs',
    { icon: 'fa-file-alt' }
  );

  // Resource tab: Deployment logs (aggregated across pods)
  window.extensionsAPI.registerResourceExtension(
    LogsPanel,
    'apps',
    'Deployment',
    'Logs',
    { icon: 'fa-file-alt' }
  );

  // Resource tab: StatefulSet logs
  window.extensionsAPI.registerResourceExtension(
    LogsPanel,
    'apps',
    'StatefulSet',
    'Logs',
    { icon: 'fa-file-alt' }
  );

  // App view: full-page log explorer for an application
  window.extensionsAPI.registerAppViewExtension(
    AppLogsView,
    'Logs',
    'fa-file-alt'
  );

})(window);
