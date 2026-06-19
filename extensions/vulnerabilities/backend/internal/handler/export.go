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

// writeCSVRow writes a single CSV row, logging and returning false on failure
// so the caller can stop instead of silently producing a truncated file.
func writeCSVRow(w *csv.Writer, row []string) bool {
	if err := w.Write(row); err != nil {
		slog.Error("failed to write csv row", "error", err)
		return false
	}
	return true
}

// flushCSV flushes the writer, logging and returning false on failure.
func flushCSV(w *csv.Writer) bool {
	w.Flush()
	if err := w.Error(); err != nil {
		slog.Error("failed to flush csv", "error", err)
		return false
	}
	return true
}

// ExportHandler handles CSV export of vulnerability and audit reports.
type ExportHandler struct {
	client dynamic.Interface
	auth   *Authorizer
}

// NewExportHandler creates a new ExportHandler.
func NewExportHandler(client dynamic.Interface, auth *Authorizer) *ExportHandler {
	return &ExportHandler{client: client, auth: auth}
}

// Handle exports reports as CSV based on the type query parameter.
func (h *ExportHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if !validateNamespace(w, namespace) {
		return
	}
	if !h.auth.AuthorizeNamespace(w, r, namespace) {
		return
	}

	exportType := r.URL.Query().Get("type")

	auditLog(r, "export.csv", namespace, "type", exportType)

	switch exportType {
	case "vulnerabilities":
		h.exportVulnerabilities(w, r, namespace)
	case "audit":
		h.exportAudit(w, r, namespace)
	case "secrets":
		h.exportSecrets(w, r, namespace)
	case "sbom":
		h.exportSbom(w, r, namespace)
	default:
		WriteError(w, http.StatusBadRequest, "type must be 'vulnerabilities', 'audit', 'secrets', or 'sbom'")
	}
}

func (h *ExportHandler) exportVulnerabilities(w http.ResponseWriter, r *http.Request, namespace string) {
	list, err := h.client.Resource(types.VulnerabilityReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{Limit: 500})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to list vulnerability reports")
		return
	}

	safeName := sanitizeFilename(namespace)
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=vulnerabilities-%s.csv", safeName))

	writer := csv.NewWriter(w)
	if !writeCSVRow(writer, []string{"Image", "Tag", "Container", "CVE", "Severity", "Score", "Package", "Installed", "Fixed", "Title", "Link"}) {
		return
	}

	seen := make(map[string]bool)
	for _, item := range list.Items {
		report := parseReport(item)
		imageKey := report.Registry + "/" + report.Image + ":" + report.Tag
		if seen[imageKey] {
			continue
		}
		seen[imageKey] = true
		for _, v := range report.Vulnerabilities {
			if !writeCSVRow(writer, []string{
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
			}) {
				return
			}
		}
	}

	flushCSV(writer)
}

func (h *ExportHandler) exportSecrets(w http.ResponseWriter, r *http.Request, namespace string) {
	list, err := h.client.Resource(types.ExposedSecretReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{Limit: 500})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to list exposed secret reports")
		return
	}

	safeName := sanitizeFilename(namespace)
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=exposed-secrets-%s.csv", safeName))

	writer := csv.NewWriter(w)
	if !writeCSVRow(writer, []string{"Image", "Tag", "Container", "RuleID", "Severity", "Category", "Title", "Target", "Match"}) {
		return
	}

	seen := make(map[string]bool)
	for _, item := range list.Items {
		report := parseSecretReport(item)
		imageKey := report.Registry + "/" + report.Image + ":" + report.Tag
		if seen[imageKey] {
			continue
		}
		seen[imageKey] = true
		for _, s := range report.Secrets {
			if !writeCSVRow(writer, []string{
				report.Image,
				report.Tag,
				report.ContainerName,
				s.RuleID,
				s.Severity,
				s.Category,
				s.Title,
				s.Target,
				s.Match,
			}) {
				return
			}
		}
	}

	flushCSV(writer)
}

func (h *ExportHandler) exportSbom(w http.ResponseWriter, r *http.Request, namespace string) {
	list, err := h.client.Resource(types.SbomReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{Limit: 500})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to list sbom reports")
		return
	}

	safeName := sanitizeFilename(namespace)
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=sbom-%s.csv", safeName))

	writer := csv.NewWriter(w)
	if !writeCSVRow(writer, []string{"Image", "Tag", "Component", "Version", "Type", "PURL"}) {
		return
	}

	seen := make(map[string]bool)
	for _, item := range list.Items {
		report := parseSbomReport(item)
		imageKey := report.Registry + "/" + report.Image + ":" + report.Tag
		if seen[imageKey] {
			continue
		}
		seen[imageKey] = true
		for _, c := range report.Components {
			if !writeCSVRow(writer, []string{
				report.Image,
				report.Tag,
				c.Name,
				c.Version,
				c.Type,
				c.Purl,
			}) {
				return
			}
		}
	}

	flushCSV(writer)
}

func (h *ExportHandler) exportAudit(w http.ResponseWriter, r *http.Request, namespace string) {
	list, err := h.client.Resource(types.ConfigAuditReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{Limit: 500})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to list config audit reports")
		return
	}

	safeName := sanitizeFilename(namespace)
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=config-audit-%s.csv", safeName))

	writer := csv.NewWriter(w)
	if !writeCSVRow(writer, []string{"Resource", "Kind", "CheckID", "Severity", "Title", "Description", "Remediation"}) {
		return
	}

	// Deduplicate by resource kind+name (old ReplicaSets from rollouts).
	seen := make(map[string]bool)
	for _, item := range list.Items {
		report := parseAuditReport(item)
		key := report.ResourceKind + "/" + report.ResourceName
		if seen[key] {
			continue
		}
		seen[key] = true
		for _, c := range report.Checks {
			if !writeCSVRow(writer, []string{
				report.ResourceName,
				report.ResourceKind,
				c.CheckID,
				c.Severity,
				c.Title,
				c.Description,
				c.Remediation,
			}) {
				return
			}
		}
	}

	flushCSV(writer)
}
