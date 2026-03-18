package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// SchedulesHandler handles requests for Velero schedules.
type SchedulesHandler struct {
	client          dynamic.Interface
	veleroNamespace string
}

// NewSchedulesHandler creates a new SchedulesHandler.
func NewSchedulesHandler(client dynamic.Interface, veleroNamespace string) *SchedulesHandler {
	return &SchedulesHandler{client: client, veleroNamespace: veleroNamespace}
}

// Handle lists schedules covering a given namespace.
func (h *SchedulesHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("schedules request", "namespace", namespace, "user", username)

	list, err := h.client.Resource(types.ScheduleGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list velero schedules", "error", err, "veleroNamespace", h.veleroNamespace)
		WriteError(w, http.StatusInternalServerError, "failed to list schedules")
		return
	}

	schedules := make([]types.ScheduleSummary, 0)
	for _, item := range list.Items {
		s := parseSchedule(item)
		if coversNamespace(s.IncludedNamespaces, s.ExcludedNamespaces, namespace) {
			schedules = append(schedules, s)
		}
	}

	WriteJSON(w, schedules)
}

// HandleTogglePause toggles the paused state of a schedule.
// Security: only app-owned schedules can be paused/unpaused. Platform schedules
// (cluster-wide or multi-namespace) are read-only to prevent users from
// disrupting platform backup coverage.
func (h *SchedulesHandler) HandleTogglePause(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		WriteError(w, http.StatusBadRequest, "schedule name is required")
		return
	}

	var req struct {
		Paused    bool   `json:"paused"`
		Namespace string `json:"namespace"`
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

	// Fetch the schedule to check ownership before allowing mutation.
	scheduleObj, err := h.client.Resource(types.ScheduleGVR).Namespace(h.veleroNamespace).Get(
		r.Context(), name, metav1.GetOptions{},
	)
	if err != nil {
		slog.Error("failed to get schedule", "error", err, "name", name)
		WriteError(w, http.StatusNotFound, "schedule not found")
		return
	}

	included := nestedStringSlice(scheduleObj.Object, "spec", "template", "includedNamespaces")
	if !isScheduleAppOwned(included, req.Namespace) {
		auditLog(r, "schedule.pause.rejected.platform", req.Namespace,
			"schedule", name, "includedNamespaces", included)
		WriteError(w, http.StatusForbidden, "cannot modify platform-managed schedules")
		return
	}

	username := r.Header.Get("Argocd-Username")
	auditLog(r, "schedule.pause", req.Namespace, "schedule", name, "paused", req.Paused)
	slog.Info("toggling schedule pause", "name", name, "paused", req.Paused, "user", username)

	patch := []byte(`{"spec":{"paused":` + boolStr(req.Paused) + `}}`)
	_, err = h.client.Resource(types.ScheduleGVR).Namespace(h.veleroNamespace).Patch(
		r.Context(), name, k8stypes.MergePatchType, patch, metav1.PatchOptions{},
	)
	if err != nil {
		slog.Error("failed to patch schedule", "error", err, "name", name)
		WriteError(w, http.StatusInternalServerError, "failed to update schedule")
		return
	}

	WriteJSON(w, map[string]interface{}{
		"name":   name,
		"paused": req.Paused,
	})
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// coversNamespace returns true if the schedule covers the target namespace.
// A schedule covers a namespace if:
// - includedNamespaces is empty (backs up everything) OR includes the namespace
// - AND excludedNamespaces does not contain the namespace
func coversNamespace(included, excluded []string, namespace string) bool {
	if len(included) > 0 {
		found := false
		for _, ns := range included {
			if ns == namespace {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	for _, ns := range excluded {
		if ns == namespace {
			return false
		}
	}

	return true
}

func parseSchedule(obj unstructured.Unstructured) types.ScheduleSummary {
	cron, _, _ := unstructured.NestedString(obj.Object, "spec", "schedule")
	paused, _, _ := unstructured.NestedBool(obj.Object, "spec", "paused")
	ttl, _, _ := unstructured.NestedString(obj.Object, "spec", "template", "ttl")
	lastBackup, _, _ := unstructured.NestedString(obj.Object, "status", "lastBackup")
	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")

	included := nestedStringSlice(obj.Object, "spec", "template", "includedNamespaces")
	excluded := nestedStringSlice(obj.Object, "spec", "template", "excludedNamespaces")

	return types.ScheduleSummary{
		Name:               obj.GetName(),
		Namespace:          obj.GetNamespace(),
		Cron:               cron,
		Paused:             paused,
		LastBackupTime:     lastBackup,
		IncludedNamespaces: included,
		ExcludedNamespaces: excluded,
		TTL:                ttl,
		LastBackupStatus:   phase,
		CreationTimestamp:  obj.GetCreationTimestamp().Format(time.RFC3339),
		Labels:             obj.GetLabels(),
	}
}

// nestedStringSlice extracts a string slice from nested unstructured data.
func nestedStringSlice(obj map[string]interface{}, fields ...string) []string {
	raw, found, err := unstructured.NestedSlice(obj, fields...)
	if err != nil || !found {
		return nil
	}
	result := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			result = append(result, s)
		}
	}
	return result
}
