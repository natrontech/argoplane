package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// OverviewHandler handles the combined overview request.
type OverviewHandler struct {
	client          dynamic.Interface
	veleroNamespace string
}

// NewOverviewHandler creates a new OverviewHandler.
func NewOverviewHandler(client dynamic.Interface, veleroNamespace string) *OverviewHandler {
	return &OverviewHandler{client: client, veleroNamespace: veleroNamespace}
}

type overviewRequest struct {
	Namespace string             `json:"namespace"`
	Resources []types.ResourceRef `json:"resources"`
}

// Handle returns a combined overview of schedules, recent backups, and storage locations.
func (h *OverviewHandler) Handle(w http.ResponseWriter, r *http.Request) {
	var req overviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if req.Namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("overview request", "namespace", req.Namespace, "user", username, "resources", len(req.Resources))

	// Build a lookup set from the app's resource tree.
	appResources := make(map[string]bool, len(req.Resources))
	for _, ref := range req.Resources {
		key := resourceKey(ref.Kind, ref.Namespace, ref.Name)
		appResources[key] = true
	}

	// Fetch all schedules and backups in parallel-style (sequential but single list each).
	scheduleList, err := h.client.Resource(types.ScheduleGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list velero schedules", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list schedules")
		return
	}

	backupList, err := h.client.Resource(types.BackupGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list velero backups", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list backups")
		return
	}

	// Pre-compute backup stats per schedule (avoids N+1 queries).
	type scheduleStats struct {
		count      int
		lastStatus string
		lastTime   string
	}
	backupsBySchedule := make(map[string]*scheduleStats)
	allBackups := make([]types.BackupSummary, 0)

	for _, item := range backupList.Items {
		b := parseBackup(item)
		if !includesNamespace(b.IncludedNamespaces, req.Namespace) {
			continue
		}
		allBackups = append(allBackups, b)

		if b.ScheduleName != "" {
			stats, ok := backupsBySchedule[b.ScheduleName]
			if !ok {
				stats = &scheduleStats{}
				backupsBySchedule[b.ScheduleName] = stats
			}
			stats.count++
			if b.StartTimestamp > stats.lastTime {
				stats.lastTime = b.StartTimestamp
				stats.lastStatus = b.Phase
			}
		}
	}

	// Filter schedules covering this namespace, enrich with ownership and backup stats.
	schedules := make([]types.ScheduleSummary, 0)
	for _, item := range scheduleList.Items {
		s := parseSchedule(item)
		if !coversNamespace(s.IncludedNamespaces, s.ExcludedNamespaces, req.Namespace) {
			continue
		}

		key := resourceKey("Schedule", item.GetNamespace(), item.GetName())
		if appResources[key] {
			s.Ownership = "app"
		} else {
			s.Ownership = "platform"
		}

		if stats, ok := backupsBySchedule[s.Name]; ok {
			s.BackupCount = stats.count
			s.LastBackupStatus = stats.lastStatus
			s.LastBackupTime = stats.lastTime
		}

		schedules = append(schedules, s)
	}

	// Sort recent backups by start time descending, limit to 10.
	sort.Slice(allBackups, func(i, j int) bool {
		return allBackups[i].StartTimestamp > allBackups[j].StartTimestamp
	})
	if len(allBackups) > 10 {
		allBackups = allBackups[:10]
	}

	// Storage locations (non-fatal if unavailable).
	storageLocations := make([]types.StorageLocationSummary, 0)
	bslList, err := h.client.Resource(types.BSLGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Warn("failed to list backup storage locations", "error", err)
	} else {
		for _, item := range bslList.Items {
			storageLocations = append(storageLocations, parseStorageLocation(item))
		}
	}

	WriteJSON(w, types.OverviewResponse{
		Schedules:        schedules,
		RecentBackups:    allBackups,
		StorageLocations: storageLocations,
		Namespace:        req.Namespace,
	})
}

func resourceKey(kind, namespace, name string) string {
	return kind + "/" + namespace + "/" + name
}
