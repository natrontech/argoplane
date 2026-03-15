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
  includedNamespaces: string[];
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
