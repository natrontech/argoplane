package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// RestoresHandler handles requests for Velero restores.
type RestoresHandler struct {
	client          dynamic.Interface
	veleroNamespace string
}

// NewRestoresHandler creates a new RestoresHandler.
func NewRestoresHandler(client dynamic.Interface, veleroNamespace string) *RestoresHandler {
	return &RestoresHandler{client: client, veleroNamespace: veleroNamespace}
}

// Handle lists restores, optionally filtered by backup name.
func (h *RestoresHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	backupFilter := r.URL.Query().Get("backup")
	username := r.Header.Get("Argocd-Username")
	slog.Debug("restores request", "namespace", namespace, "backup", backupFilter, "user", username)

	list, err := h.client.Resource(types.RestoreGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list velero restores", "error", err, "veleroNamespace", h.veleroNamespace)
		WriteError(w, http.StatusInternalServerError, "failed to list restores")
		return
	}

	restores := make([]types.RestoreSummary, 0)
	for _, item := range list.Items {
		rs := parseRestore(item)

		if backupFilter != "" && rs.BackupName != backupFilter {
			continue
		}

		// Filter by includedNamespaces if present.
		included := nestedStringSlice(item.Object, "spec", "includedNamespaces")
		if !includesNamespace(included, namespace) {
			continue
		}

		restores = append(restores, rs)
	}

	WriteJSON(w, restores)
}

// HandleCreate creates a restore from a backup.
func (h *RestoresHandler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BackupName string `json:"backupName"`
		Namespace  string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if req.BackupName == "" {
		WriteError(w, http.StatusBadRequest, "backupName is required")
		return
	}
	if req.Namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Info("creating restore", "backup", req.BackupName, "namespace", req.Namespace, "user", username)

	restoreName := fmt.Sprintf("restore-%s-%d", req.BackupName, time.Now().Unix())

	restore := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "velero.io/v1",
			"kind":       "Restore",
			"metadata": map[string]interface{}{
				"name":      restoreName,
				"namespace": h.veleroNamespace,
				"labels": map[string]interface{}{
					"argoplane.io/triggered-by": username,
				},
			},
			"spec": map[string]interface{}{
				"backupName":         req.BackupName,
				"includedNamespaces": []interface{}{req.Namespace},
			},
		},
	}

	created, err := h.client.Resource(types.RestoreGVR).Namespace(h.veleroNamespace).Create(r.Context(), restore, metav1.CreateOptions{})
	if err != nil {
		slog.Error("failed to create restore", "error", err, "name", restoreName)
		WriteError(w, http.StatusInternalServerError, "failed to create restore")
		return
	}

	slog.Info("restore created", "name", created.GetName(), "backup", req.BackupName)
	w.WriteHeader(http.StatusAccepted)
	WriteJSON(w, map[string]string{
		"name":    created.GetName(),
		"status":  "accepted",
		"message": fmt.Sprintf("Restore %s created from backup %s", created.GetName(), req.BackupName),
	})
}

func parseRestore(obj unstructured.Unstructured) types.RestoreSummary {
	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")
	backupName, _, _ := unstructured.NestedString(obj.Object, "spec", "backupName")
	startTs, _, _ := unstructured.NestedString(obj.Object, "status", "startTimestamp")
	completionTs, _, _ := unstructured.NestedString(obj.Object, "status", "completionTimestamp")

	return types.RestoreSummary{
		Name:                obj.GetName(),
		Namespace:           obj.GetNamespace(),
		Phase:               phase,
		BackupName:          backupName,
		StartTimestamp:      startTs,
		CompletionTimestamp: completionTs,
		ItemsRestored:       nestedInt(obj.Object, "status", "progress", "itemsRestored"),
		TotalItems:          nestedInt(obj.Object, "status", "progress", "totalItems"),
		Errors:              nestedInt(obj.Object, "status", "errors"),
		Warnings:            nestedInt(obj.Object, "status", "warnings"),
	}
}
