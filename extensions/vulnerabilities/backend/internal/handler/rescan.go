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
