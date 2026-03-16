import * as React from 'react';
import { LogsPanel } from './components/LogsPanel';
import { AppLogsView } from './components/AppLogsView';


((window: any) => {
  // Resource tab: Pod log explorer (Loki-backed historical search)
  window.extensionsAPI.registerResourceExtension(
    LogsPanel,
    '',
    'Pod',
    'Log Explorer',
    { icon: 'fa-search' }
  );

  // Resource tab: Deployment log explorer (aggregated across pods)
  window.extensionsAPI.registerResourceExtension(
    LogsPanel,
    'apps',
    'Deployment',
    'Log Explorer',
    { icon: 'fa-search' }
  );

  // Resource tab: StatefulSet log explorer
  window.extensionsAPI.registerResourceExtension(
    LogsPanel,
    'apps',
    'StatefulSet',
    'Log Explorer',
    { icon: 'fa-search' }
  );

  // App view: full-page log explorer for an application
  window.extensionsAPI.registerAppViewExtension(
    AppLogsView,
    'Log Explorer',
    'fa-search'
  );

})(window);
