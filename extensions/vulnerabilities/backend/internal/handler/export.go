package handler

import (
	"encoding/csv"
	"fmt"
	"log/slog"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// ExportHandler handles CSV export of vulnerability and audit reports.
type ExportHandler struct {
	client dynamic.Interface
}

// NewExportHandler creates a new ExportHandler.
func NewExportHandler(client dynamic.Interface) *ExportHandler {
	return &ExportHandler{client: client}
}

// Handle exports reports as CSV based on the type query parameter.
func (h *ExportHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	exportType := r.URL.Query().Get("type")
	switch exportType {
	case "vulnerabilities":
		h.exportVulnerabilities(w, r, namespace)
	case "audit":
		h.exportAudit(w, r, namespace)
	default:
		WriteError(w, http.StatusBadRequest, "type must be 'vulnerabilities' or 'audit'")
	}
}

func (h *ExportHandler) exportVulnerabilities(w http.ResponseWriter, r *http.Request, namespace string) {
	list, err := h.client.Resource(types.VulnerabilityReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list vulnerability reports for export", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list vulnerability reports")
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=vulnerabilities-%s.csv", namespace))

	writer := csv.NewWriter(w)
	writer.Write([]string{"Image", "Tag", "Container", "CVE", "Severity", "Score", "Package", "Installed", "Fixed", "Title", "Link"})

	for _, item := range list.Items {
		report := parseReport(item)
		for _, v := range report.Vulnerabilities {
			writer.Write([]string{
				report.Image,
				report.Tag,
				report.ContainerName,
				v.ID,
				v.Severity,
				fmt.Sprintf("%.1f", v.Score),
				v.Package,
				v.InstalledVersion,
				v.FixedVersion,
				v.Title,
				v.PrimaryLink,
			})
		}
	}

	writer.Flush()
}

func (h *ExportHandler) exportAudit(w http.ResponseWriter, r *http.Request, namespace string) {
	list, err := h.client.Resource(types.ConfigAuditReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list config audit reports for export", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list config audit reports")
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=config-audit-%s.csv", namespace))

	writer := csv.NewWriter(w)
	writer.Write([]string{"Resource", "Kind", "CheckID", "Severity", "Title", "Description", "Remediation"})

	for _, item := range list.Items {
		report := parseAuditReport(item)
		for _, c := range report.Checks {
			writer.Write([]string{
				report.ResourceName,
				report.ResourceKind,
				c.CheckID,
				c.Severity,
				c.Title,
				c.Description,
				c.Remediation,
			})
		}
	}

	writer.Flush()
}
