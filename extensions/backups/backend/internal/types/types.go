package types

import "k8s.io/apimachinery/pkg/runtime/schema"

var (
	ScheduleGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "schedules",
	}
	BackupGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "backups",
	}
	RestoreGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "restores",
	}
	BSLGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "backupstoragelocations",
	}
	DownloadRequestGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "downloadrequests",
	}
	PodVolumeBackupGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "podvolumebackups",
	}
	PodVolumeRestoreGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "podvolumerestores",
	}
	DeleteBackupRequestGVR = schema.GroupVersionResource{
		Group:    "velero.io",
		Version:  "v1",
		Resource: "deletebackuprequests",
	}
)

// ResourceRef identifies a resource from the ArgoCD resource tree.
type ResourceRef struct {
	Group     string `json:"group"`
	Kind      string `json:"kind"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

// ScheduleSummary is the JSON response for a Velero schedule.
type ScheduleSummary struct {
	Name               string            `json:"name"`
	Namespace          string            `json:"namespace"`
	Cron               string            `json:"cron"`
	Paused             bool              `json:"paused"`
	LastBackupTime     string            `json:"lastBackupTime,omitempty"`
	IncludedNamespaces []string          `json:"includedNamespaces"`
	ExcludedNamespaces []string          `json:"excludedNamespaces"`
	TTL                string            `json:"ttl,omitempty"`
	Ownership          string            `json:"ownership"`
	BackupCount        int               `json:"backupCount"`
	LastBackupStatus   string            `json:"lastBackupStatus,omitempty"`
	CreationTimestamp  string            `json:"creationTimestamp"`
	Labels             map[string]string `json:"labels,omitempty"`
}

// BackupSummary is the JSON response for a Velero backup.
type BackupSummary struct {
	Name                      string            `json:"name"`
	Namespace                 string            `json:"namespace"`
	Phase                     string            `json:"phase"`
	ScheduleName              string            `json:"scheduleName,omitempty"`
	StartTimestamp            string            `json:"startTimestamp,omitempty"`
	CompletionTimestamp       string            `json:"completionTimestamp,omitempty"`
	ExpiresAt                 string            `json:"expiresAt,omitempty"`
	ItemsBackedUp             int               `json:"itemsBackedUp"`
	TotalItems                int               `json:"totalItems"`
	Errors                    int               `json:"errors"`
	Warnings                  int               `json:"warnings"`
	FailureReason             string            `json:"failureReason,omitempty"`
	ValidationErrors          []string          `json:"validationErrors,omitempty"`
	IncludedNamespaces        []string          `json:"includedNamespaces"`
	IncludedResources         []string          `json:"includedResources,omitempty"`
	ExcludedResources         []string          `json:"excludedResources,omitempty"`
	VolumeSnapshotsAttempted  int               `json:"volumeSnapshotsAttempted"`
	VolumeSnapshotsCompleted  int               `json:"volumeSnapshotsCompleted"`
	Labels                    map[string]string `json:"labels,omitempty"`
}

// RestoreSummary is the JSON response for a Velero restore.
type RestoreSummary struct {
	Name                   string            `json:"name"`
	Namespace              string            `json:"namespace"`
	Phase                  string            `json:"phase"`
	BackupName             string            `json:"backupName"`
	StartTimestamp         string            `json:"startTimestamp,omitempty"`
	CompletionTimestamp    string            `json:"completionTimestamp,omitempty"`
	ItemsRestored          int               `json:"itemsRestored"`
	TotalItems             int               `json:"totalItems"`
	Errors                 int               `json:"errors"`
	Warnings               int               `json:"warnings"`
	FailureReason          string            `json:"failureReason,omitempty"`
	ValidationErrors       []string          `json:"validationErrors,omitempty"`
	IncludedResources      []string          `json:"includedResources,omitempty"`
	ExcludedResources      []string          `json:"excludedResources,omitempty"`
	NamespaceMapping       map[string]string `json:"namespaceMapping,omitempty"`
	ExistingResourcePolicy string            `json:"existingResourcePolicy,omitempty"`
}

// RestoreCreateRequest is the request body for creating a restore.
type RestoreCreateRequest struct {
	BackupName             string            `json:"backupName"`
	Namespace              string            `json:"namespace"`
	IncludedResources      []string          `json:"includedResources,omitempty"`
	ExcludedResources      []string          `json:"excludedResources,omitempty"`
	NamespaceMapping       map[string]string `json:"namespaceMapping,omitempty"`
	ExistingResourcePolicy string            `json:"existingResourcePolicy,omitempty"`
	RestorePVs             *bool             `json:"restorePVs,omitempty"`
}

// StorageLocationSummary is the JSON response for a Velero backup storage location.
type StorageLocationSummary struct {
	Name               string `json:"name"`
	Namespace          string `json:"namespace"`
	Provider           string `json:"provider"`
	Bucket             string `json:"bucket,omitempty"`
	Phase              string `json:"phase"`
	LastValidationTime string `json:"lastValidationTime,omitempty"`
}

// PodVolumeBackupSummary is the JSON response for a Velero PodVolumeBackup.
type PodVolumeBackupSummary struct {
	Name                string `json:"name"`
	Namespace           string `json:"namespace"`
	Phase               string `json:"phase"`
	BackupName          string `json:"backupName"`
	PodName             string `json:"podName"`
	PodNamespace        string `json:"podNamespace"`
	Volume              string `json:"volume"`
	UploaderType        string `json:"uploaderType,omitempty"`
	StartTimestamp      string `json:"startTimestamp,omitempty"`
	CompletionTimestamp string `json:"completionTimestamp,omitempty"`
	BytesDone           int64  `json:"bytesDone"`
	TotalBytes          int64  `json:"totalBytes"`
	Message             string `json:"message,omitempty"`
}

// PodVolumeRestoreSummary is the JSON response for a Velero PodVolumeRestore.
type PodVolumeRestoreSummary struct {
	Name                string `json:"name"`
	Namespace           string `json:"namespace"`
	Phase               string `json:"phase"`
	RestoreName         string `json:"restoreName"`
	PodName             string `json:"podName"`
	PodNamespace        string `json:"podNamespace"`
	Volume              string `json:"volume"`
	UploaderType        string `json:"uploaderType,omitempty"`
	StartTimestamp      string `json:"startTimestamp,omitempty"`
	CompletionTimestamp string `json:"completionTimestamp,omitempty"`
	BytesDone           int64  `json:"bytesDone"`
	TotalBytes          int64  `json:"totalBytes"`
	Message             string `json:"message,omitempty"`
}

// OverviewResponse is the combined response for the overview endpoint.
type OverviewResponse struct {
	Schedules        []ScheduleSummary        `json:"schedules"`
	RecentBackups    []BackupSummary          `json:"recentBackups"`
	StorageLocations []StorageLocationSummary `json:"storageLocations"`
	Namespace        string                   `json:"namespace"`
}
