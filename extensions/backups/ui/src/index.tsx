import * as React from 'react';
import { AppBackupsView } from './components/AppBackupsView';
import { BackupStatusPanel } from './components/BackupStatusPanel';
import { ScheduleBackupsTab } from './components/ScheduleBackupsTab';
import { BackupDetailTab } from './components/BackupDetailTab';

((window: any) => {
  // App-level backup management view
  window.extensionsAPI.registerAppViewExtension(
    AppBackupsView,
    'Backups',
    'fa-archive'
  );

  // Status panel: compact backup status in the app header
  window.extensionsAPI.registerStatusPanelExtension(
    BackupStatusPanel,
    'Backups',
    'backups'
  );

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
