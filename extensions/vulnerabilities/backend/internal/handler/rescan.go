package handler

import (
	"log/slog"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// RescanHandler handles vulnerability rescan requests.
type RescanHandler struct {
	client dynamic.Interface
}

// NewRescanHandler creates a new RescanHandler.
func NewRescanHandler(client dynamic.Interface) *RescanHandler {
	return &RescanHandler{client: client}
}

// Handle triggers a rescan by deleting the VulnerabilityReport (operator recreates it).
func (h *RescanHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	reportName := r.URL.Query().Get("report")

	if namespace == "" || reportName == "" {
		WriteError(w, http.StatusBadRequest, "namespace and report are required")
		return
	}

	auditLog(r, "rescan", namespace, "report", reportName)

	err := h.client.Resource(types.VulnerabilityReportGVR).Namespace(namespace).Delete(r.Context(), reportName, metav1.DeleteOptions{})
	if err != nil {
		slog.Error("failed to delete vulnerability report for rescan", "error", err, "namespace", namespace, "report", reportName)
		WriteError(w, http.StatusInternalServerError, "failed to trigger rescan")
		return
	}

	slog.Info("triggered rescan", "namespace", namespace, "report", reportName)
	WriteJSON(w, map[string]string{"status": "rescan triggered"})
}

// HandleAll triggers a rescan of all images in a namespace by deleting all VulnerabilityReports.
func (h *RescanHandler) HandleAll(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	auditLog(r, "rescan-all", namespace)

	list, err := h.client.Resource(types.VulnerabilityReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list vulnerability reports for rescan", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list reports")
		return
	}

	deleted := 0
	for _, item := range list.Items {
		err := h.client.Resource(types.VulnerabilityReportGVR).Namespace(namespace).Delete(r.Context(), item.GetName(), metav1.DeleteOptions{})
		if err != nil {
			slog.Warn("failed to delete report during rescan-all", "error", err, "report", item.GetName())
			continue
		}
		deleted++
	}

	slog.Info("triggered rescan-all", "namespace", namespace, "deleted", deleted)
	WriteJSON(w, map[string]any{"status": "rescan triggered", "deleted": deleted})
}
