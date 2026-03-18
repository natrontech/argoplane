import * as React from 'react';
import { registerArgoPlaneView } from '@argoplane/shared';
import { AppBackupsView } from './components/AppBackupsView';
import { ScheduleBackupsTab } from './components/ScheduleBackupsTab';
import { BackupDetailTab } from './components/BackupDetailTab';

// Register app view via ArgoPlane consolidated tab
registerArgoPlaneView({
  id: 'backups',
  title: 'Backups',
  icon: 'fa-archive',
  component: AppBackupsView,
});

((window: any) => {
  // Schedule resource tab: backups from a specific schedule
  window.extensionsAPI.registerResourceExtension(
    ScheduleBackupsTab,
    'velero.io',
    'Schedule',
    'Backups',
    { icon: 'fa-archive' }
  );

  // Backup resource tab: backup details and restore actions
  window.extensionsAPI.registerResourceExtension(
    BackupDetailTab,
    'velero.io',
    'Backup',
    'Details',
    { icon: 'fa-undo' }
  );
})(window);
