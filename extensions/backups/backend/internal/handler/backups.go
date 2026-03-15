package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// BackupsHandler handles requests for Velero backups.
type BackupsHandler struct {
	client          dynamic.Interface
	veleroNamespace string
}

// NewBackupsHandler creates a new BackupsHandler.
func NewBackupsHandler(client dynamic.Interface, veleroNamespace string) *BackupsHandler {
	return &BackupsHandler{client: client, veleroNamespace: veleroNamespace}
}

// Handle lists backups for a given namespace, optionally filtered by schedule.
func (h *BackupsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	schedule := r.URL.Query().Get("schedule")
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
			if limit > 100 {
				limit = 100
			}
		}
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("backups request", "namespace", namespace, "schedule", schedule, "limit", limit, "user", username)

	listOpts := metav1.ListOptions{}
	if schedule != "" {
		listOpts.LabelSelector = "velero.io/schedule-name=" + schedule
	}

	list, err := h.client.Resource(types.BackupGVR).Namespace(h.veleroNamespace).List(r.Context(), listOpts)
	if err != nil {
		slog.Error("failed to list velero backups", "error", err, "veleroNamespace", h.veleroNamespace)
		WriteError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}

	backups := make([]types.BackupSummary, 0)
	for _, item := range list.Items {
		b := parseBackup(item)
		if includesNamespace(b.IncludedNamespaces, namespace) {
			backups = append(backups, b)
		}
	}

	// Sort by startTimestamp descending.
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].StartTimestamp > backups[j].StartTimestamp
	})

	if len(backups) > limit {
		backups = backups[:limit]
	}

	WriteJSON(w, backups)
}

// HandleCreate creates an on-demand backup for a namespace.
func (h *BackupsHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Namespace string `json:"namespace"`
		TTL       string `json:"ttl,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if req.Namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	if req.TTL == "" {
		req.TTL = "72h0m0s"
	}

	username := r.Header.Get("Argocd-Username")
	slog.Info("creating on-demand backup", "namespace", req.Namespace, "ttl", req.TTL, "user", username)

	backupName := fmt.Sprintf("%s-ondemand-%d", req.Namespace, time.Now().Unix())

	backup := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "velero.io/v1",
			"kind":       "Backup",
			"metadata": map[string]interface{}{
				"name":      backupName,
				"namespace": h.veleroNamespace,
				"labels": map[string]interface{}{
					"argoplane.io/triggered-by": username,
					"argoplane.io/on-demand":    "true",
				},
			},
			"spec": map[string]interface{}{
				"includedNamespaces": []interface{}{req.Namespace},
				"ttl":               req.TTL,
			},
		},
	}

	created, err := h.client.Resource(types.BackupGVR).Namespace(h.veleroNamespace).Create(r.Context(), backup, metav1.CreateOptions{})
	if err != nil {
		slog.Error("failed to create backup", "error", err, "name", backupName)
		WriteError(w, http.StatusInternalServerError, "failed to create backup")
		return
	}

	slog.Info("backup created", "name", created.GetName(), "namespace", h.veleroNamespace)
	w.WriteHeader(http.StatusAccepted)
	WriteJSON(w, map[string]string{
		"name":    created.GetName(),
		"status":  "accepted",
		"message": fmt.Sprintf("Backup %s created for namespace %s", created.GetName(), req.Namespace),
	})
}

// includesNamespace returns true if the backup's included namespaces list
// is empty (all namespaces) or contains the target namespace.
func includesNamespace(included []string, namespace string) bool {
	if len(included) == 0 {
		return true
	}
	for _, ns := range included {
		if ns == namespace {
			return true
		}
	}
	return false
}

func parseBackup(obj unstructured.Unstructured) types.BackupSummary {
	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")
	startTs, _, _ := unstructured.NestedString(obj.Object, "status", "startTimestamp")
	completionTs, _, _ := unstructured.NestedString(obj.Object, "status", "completionTimestamp")
	expiration, _, _ := unstructured.NestedString(obj.Object, "status", "expiration")
	included := nestedStringSlice(obj.Object, "spec", "includedNamespaces")

	labels := obj.GetLabels()
	scheduleName := ""
	if labels != nil {
		scheduleName = labels["velero.io/schedule-name"]
	}

	return types.BackupSummary{
		Name:                      obj.GetName(),
		Namespace:                 obj.GetNamespace(),
		Phase:                     phase,
		ScheduleName:              scheduleName,
		StartTimestamp:            startTs,
		CompletionTimestamp:       completionTs,
		ExpiresAt:                 expiration,
		ItemsBackedUp:             nestedInt(obj.Object, "status", "progress", "itemsBackedUp"),
		TotalItems:                nestedInt(obj.Object, "status", "progress", "totalItems"),
		Errors:                    nestedInt(obj.Object, "status", "errors"),
		Warnings:                  nestedInt(obj.Object, "status", "warnings"),
		IncludedNamespaces:        included,
		VolumeSnapshotsAttempted:  nestedInt(obj.Object, "status", "volumeSnapshotsAttempted"),
		VolumeSnapshotsCompleted:  nestedInt(obj.Object, "status", "volumeSnapshotsCompleted"),
		Labels:                    labels,
	}
}

// nestedInt extracts an int from nested unstructured data.
// Tries int64 first, then float64 (JSON numbers can be either).
func nestedInt(obj map[string]interface{}, fields ...string) int {
	val, found, err := unstructured.NestedInt64(obj, fields...)
	if err == nil && found {
		return int(val)
	}
	// JSON numbers may decode as float64.
	fval, found, err := unstructured.NestedFloat64(obj, fields...)
	if err == nil && found {
		return int(fval)
	}
	return 0
}
