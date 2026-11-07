package handler

import (
	"encoding/json"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// OverviewHandler handles app-level vulnerability aggregation.
type OverviewHandler struct {
	clients Clients
	auth    *Authorizer
}

// NewOverviewHandler creates a new OverviewHandler.
func NewOverviewHandler(clients Clients, auth *Authorizer) *OverviewHandler {
	return &OverviewHandler{clients: clients, auth: auth}
}

// Handle returns an aggregated vulnerability overview for an application's namespace.
// Trivy Operator creates reports per ReplicaSet/DaemonSet/StatefulSet, not per Pod,
// so we simply list all reports in the namespace and deduplicate by image.
func (h *OverviewHandler) Handle(w http.ResponseWriter, r *http.Request) {
	var req types.OverviewRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if !validateNamespace(w, req.Namespace) {
		return
	}
	if !h.auth.AuthorizeNamespace(w, r, req.Namespace) {
		return
	}

	auditLog(r, "vulnerability.overview", req.Namespace)

	var truncated bool
	listOpts := metav1.ListOptions{LabelSelector: resourceLabelSelector(req.Resources)}
	cl, err := clientFor(h.clients, h.auth, r)
	if err != nil {
		WriteError(w, http.StatusBadGateway, "cannot reach the cluster this application deploys to")
		return
	}
	reportList := cl.Resource(types.VulnerabilityReportGVR).Namespace(req.Namespace).List

	totalSummary := types.VulnerabilitySummary{}
	totalFixable := 0

	// Deduplicate by image (same image used in multiple workloads).
	seen := make(map[string]bool)
	images := make([]types.ImageReport, 0)

	for item, err := range eachReport(r.Context(), reportList, listOpts, &truncated) {
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to list vulnerability reports")
			return
		}
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
		Truncated: truncated,
	})
}
