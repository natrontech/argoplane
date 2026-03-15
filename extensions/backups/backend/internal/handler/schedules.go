package handler

import (
	"log/slog"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
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
