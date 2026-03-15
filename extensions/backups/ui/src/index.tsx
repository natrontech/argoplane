import * as React from 'react';
import { BackupStatusPanel } from './components/BackupStatusPanel';
import { BackupFlyout } from './components/BackupFlyout';

((window: any) => {
  // Register as an application status panel extension
  window.extensionsAPI.registerStatusPanelExtension(
    BackupStatusPanel,
    'Backups',
    'argoplane-backups',
    BackupFlyout
  );
})(window);
