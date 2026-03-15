package handler

import (
	"log/slog"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// VolumesHandler handles requests for Velero PodVolumeBackups and PodVolumeRestores.
type VolumesHandler struct {
	client          dynamic.Interface
	veleroNamespace string
}

// NewVolumesHandler creates a new VolumesHandler.
func NewVolumesHandler(client dynamic.Interface, veleroNamespace string) *VolumesHandler {
	return &VolumesHandler{client: client, veleroNamespace: veleroNamespace}
}

// HandleBackups lists PodVolumeBackups for a given backup name.
func (h *VolumesHandler) HandleBackups(w http.ResponseWriter, r *http.Request) {
	backup := r.URL.Query().Get("backup")
	if backup == "" {
		WriteError(w, http.StatusBadRequest, "backup is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("pod volume backups request", "backup", backup, "user", username)

	list, err := h.client.Resource(types.PodVolumeBackupGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{
		LabelSelector: "velero.io/backup-name=" + backup,
	})
	if err != nil {
		slog.Error("failed to list pod volume backups", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list pod volume backups")
		return
	}

	result := make([]types.PodVolumeBackupSummary, 0, len(list.Items))
	for _, item := range list.Items {
		result = append(result, parsePodVolumeBackup(item))
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].StartTimestamp > result[j].StartTimestamp
	})

	WriteJSON(w, result)
}

// HandleRestores lists PodVolumeRestores for a given restore name.
func (h *VolumesHandler) HandleRestores(w http.ResponseWriter, r *http.Request) {
	restore := r.URL.Query().Get("restore")
	if restore == "" {
		WriteError(w, http.StatusBadRequest, "restore is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("pod volume restores request", "restore", restore, "user", username)

	list, err := h.client.Resource(types.PodVolumeRestoreGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{
		LabelSelector: "velero.io/restore-name=" + restore,
	})
	if err != nil {
		slog.Error("failed to list pod volume restores", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list pod volume restores")
		return
	}

	result := make([]types.PodVolumeRestoreSummary, 0, len(list.Items))
	for _, item := range list.Items {
		result = append(result, parsePodVolumeRestore(item))
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].StartTimestamp > result[j].StartTimestamp
	})

	WriteJSON(w, result)
}

func parsePodVolumeBackup(obj unstructured.Unstructured) types.PodVolumeBackupSummary {
	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")
	startTs, _, _ := unstructured.NestedString(obj.Object, "status", "startTimestamp")
	completionTs, _, _ := unstructured.NestedString(obj.Object, "status", "completionTimestamp")
	message, _, _ := unstructured.NestedString(obj.Object, "status", "message")
	backupName, _, _ := unstructured.NestedString(obj.Object, "spec", "backupName")
	podName, _, _ := unstructured.NestedString(obj.Object, "spec", "pod", "name")
	podNamespace, _, _ := unstructured.NestedString(obj.Object, "spec", "pod", "namespace")
	volume, _, _ := unstructured.NestedString(obj.Object, "spec", "volume")
	uploaderType, _, _ := unstructured.NestedString(obj.Object, "spec", "uploaderType")

	return types.PodVolumeBackupSummary{
		Name:                obj.GetName(),
		Namespace:           obj.GetNamespace(),
		Phase:               phase,
		BackupName:          backupName,
		PodName:             podName,
		PodNamespace:        podNamespace,
		Volume:              volume,
		UploaderType:        uploaderType,
		StartTimestamp:      startTs,
		CompletionTimestamp: completionTs,
		BytesDone:           nestedInt64(obj.Object, "status", "progress", "bytesDone"),
		TotalBytes:          nestedInt64(obj.Object, "status", "progress", "totalBytes"),
		Message:             message,
	}
}

func parsePodVolumeRestore(obj unstructured.Unstructured) types.PodVolumeRestoreSummary {
	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")
	startTs, _, _ := unstructured.NestedString(obj.Object, "status", "startTimestamp")
	completionTs, _, _ := unstructured.NestedString(obj.Object, "status", "completionTimestamp")
	message, _, _ := unstructured.NestedString(obj.Object, "status", "message")
	restoreName, _, _ := unstructured.NestedString(obj.Object, "spec", "restoreName")
	podName, _, _ := unstructured.NestedString(obj.Object, "spec", "pod", "name")
	podNamespace, _, _ := unstructured.NestedString(obj.Object, "spec", "pod", "namespace")
	volume, _, _ := unstructured.NestedString(obj.Object, "spec", "volume")
	uploaderType, _, _ := unstructured.NestedString(obj.Object, "spec", "uploaderType")

	return types.PodVolumeRestoreSummary{
		Name:                obj.GetName(),
		Namespace:           obj.GetNamespace(),
		Phase:               phase,
		RestoreName:         restoreName,
		PodName:             podName,
		PodNamespace:        podNamespace,
		Volume:              volume,
		UploaderType:        uploaderType,
		StartTimestamp:      startTs,
		CompletionTimestamp: completionTs,
		BytesDone:           nestedInt64(obj.Object, "status", "progress", "bytesDone"),
		TotalBytes:          nestedInt64(obj.Object, "status", "progress", "totalBytes"),
		Message:             message,
	}
}

// nestedInt64 extracts an int64 from nested unstructured data.
func nestedInt64(obj map[string]interface{}, fields ...string) int64 {
	val, found, err := unstructured.NestedInt64(obj, fields...)
	if err == nil && found {
		return val
	}
	fval, found, err := unstructured.NestedFloat64(obj, fields...)
	if err == nil && found {
		return int64(fval)
	}
	return 0
}
