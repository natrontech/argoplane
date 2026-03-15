import * as React from 'react';
import { BackupFlyout } from './components/BackupFlyout';

((window: any) => {
  // App view: backup management as a view in the application detail
  window.extensionsAPI.registerAppViewExtension(
    BackupFlyout,
    'Backups',
    'fa-archive'
  );
})(window);
