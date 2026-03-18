package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// OverviewHandler handles app-level vulnerability aggregation.
type OverviewHandler struct {
	client dynamic.Interface
}

// NewOverviewHandler creates a new OverviewHandler.
func NewOverviewHandler(client dynamic.Interface) *OverviewHandler {
	return &OverviewHandler{client: client}
}

// Handle returns an aggregated vulnerability overview for an application's namespace.
// Trivy Operator creates reports per ReplicaSet/DaemonSet/StatefulSet, not per Pod,
// so we simply list all reports in the namespace and deduplicate by image.
func (h *OverviewHandler) Handle(w http.ResponseWriter, r *http.Request) {
	var req types.OverviewRequest
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
	slog.Debug("overview request", "namespace", req.Namespace, "user", username)

	list, err := h.client.Resource(types.VulnerabilityReportGVR).Namespace(req.Namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list vulnerability reports", "error", err, "namespace", req.Namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list vulnerability reports")
		return
	}

	totalSummary := types.VulnerabilitySummary{}
	totalFixable := 0

	// Deduplicate by image (same image used in multiple workloads).
	seen := make(map[string]bool)
	images := make([]types.ImageReport, 0)

	for _, item := range list.Items {
		report := parseReport(item)

		// Deduplicate by image:tag.
		imageKey := report.Registry + "/" + report.Image + ":" + report.Tag
		if seen[imageKey] {
			continue
		}
		seen[imageKey] = true

		totalSummary.Critical += report.Summary.Critical
		totalSummary.High += report.Summary.High
		totalSummary.Medium += report.Summary.Medium
		totalSummary.Low += report.Summary.Low
		totalSummary.Unknown += report.Summary.Unknown
		totalFixable += report.Fixable

		images = append(images, report)
	}

	// Sort images by severity.
	sort.Slice(images, func(i, j int) bool {
		return severityScore(images[i].Summary) > severityScore(images[j].Summary)
	})

	WriteJSON(w, types.OverviewResponse{
		Summary:   totalSummary,
		Fixable:   totalFixable,
		Images:    images,
		Namespace: req.Namespace,
	})
}
