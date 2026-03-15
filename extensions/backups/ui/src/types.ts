export interface ScheduleSummary {
  name: string;
  namespace: string;
  cron: string;
  paused: boolean;
  lastBackupTime?: string;
  includedNamespaces: string[];
  excludedNamespaces?: string[];
  ttl: string;
  ownership: 'app' | 'platform';
  backupCount: number;
  lastBackupStatus?: string;
  creationTimestamp: string;
  labels?: Record<string, string>;
}

export interface BackupSummary {
  name: string;
  namespace: string;
  phase: string;
  scheduleName?: string;
  startTimestamp?: string;
  completionTimestamp?: string;
  expiresAt?: string;
  itemsBackedUp: number;
  totalItems: number;
  errors: number;
  warnings: number;
  failureReason?: string;
  validationErrors?: string[];
  includedNamespaces: string[];
  includedResources?: string[];
  excludedResources?: string[];
  volumeSnapshotsAttempted: number;
  volumeSnapshotsCompleted: number;
  labels?: Record<string, string>;
}

export interface RestoreSummary {
  name: string;
  namespace: string;
  phase: string;
  backupName: string;
  startTimestamp?: string;
  completionTimestamp?: string;
  itemsRestored: number;
  totalItems: number;
  errors: number;
  warnings: number;
  failureReason?: string;
  validationErrors?: string[];
  includedResources?: string[];
  excludedResources?: string[];
  namespaceMapping?: Record<string, string>;
  existingResourcePolicy?: string;
}

export interface RestoreOptions {
  includedResources?: string[];
  excludedResources?: string[];
  namespaceMapping?: Record<string, string>;
  existingResourcePolicy?: 'none' | 'update';
  restorePVs?: boolean;
}

export interface StorageLocationSummary {
  name: string;
  namespace: string;
  provider: string;
  bucket: string;
  phase: string;
  lastValidationTime?: string;
}

export interface OverviewResponse {
  schedules: ScheduleSummary[];
  recentBackups: BackupSummary[];
  storageLocations: StorageLocationSummary[];
  namespace: string;
}

export interface ResourceRef {
  group: string;
  kind: string;
  namespace: string;
  name: string;
}

export interface PodVolumeBackupSummary {
  name: string;
  namespace: string;
  phase: string;
  backupName: string;
  podName: string;
  podNamespace: string;
  volume: string;
  uploaderType?: string;
  startTimestamp?: string;
  completionTimestamp?: string;
  bytesDone: number;
  totalBytes: number;
  message?: string;
}

export interface PodVolumeRestoreSummary {
  name: string;
  namespace: string;
  phase: string;
  restoreName: string;
  podName: string;
  podNamespace: string;
  volume: string;
  uploaderType?: string;
  startTimestamp?: string;
  completionTimestamp?: string;
  bytesDone: number;
  totalBytes: number;
  message?: string;
}
