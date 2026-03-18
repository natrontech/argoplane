package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// AuditHandler handles config audit report queries.
type AuditHandler struct {
	client dynamic.Interface
}

// NewAuditHandler creates a new AuditHandler.
func NewAuditHandler(client dynamic.Interface) *AuditHandler {
	return &AuditHandler{client: client}
}

// HandleOverview returns an aggregated config audit overview for a namespace.
func (h *AuditHandler) HandleOverview(w http.ResponseWriter, r *http.Request) {
	var req types.AuditOverviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if req.Namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	slog.Debug("audit overview request", "namespace", req.Namespace)

	list, err := h.client.Resource(types.ConfigAuditReportGVR).Namespace(req.Namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list config audit reports", "error", err, "namespace", req.Namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list config audit reports")
		return
	}

	totalSummary := types.VulnerabilitySummary{}
	reports := make([]types.AuditReport, 0, len(list.Items))

	for _, item := range list.Items {
		report := parseAuditReport(item)

		totalSummary.Critical += report.Summary.Critical
		totalSummary.High += report.Summary.High
		totalSummary.Medium += report.Summary.Medium
		totalSummary.Low += report.Summary.Low

		reports = append(reports, report)
	}

	// Sort by severity.
	sort.Slice(reports, func(i, j int) bool {
		return severityScore(reports[i].Summary) > severityScore(reports[j].Summary)
	})

	WriteJSON(w, types.AuditOverviewResponse{
		Summary:   totalSummary,
		Reports:   reports,
		Namespace: req.Namespace,
	})
}

func parseAuditReport(item unstructured.Unstructured) types.AuditReport {
	labels := item.GetLabels()
	report, _, _ := unstructured.NestedMap(item.Object, "report")

	// Parse summary.
	summary, _ := nestedMap(report, "summary")
	auditSummary := types.VulnerabilitySummary{
		Critical: nestedInt(summary, "criticalCount"),
		High:     nestedInt(summary, "highCount"),
		Medium:   nestedInt(summary, "mediumCount"),
		Low:      nestedInt(summary, "lowCount"),
	}

	// Parse checks (only failed ones).
	checksRaw, _, _ := unstructured.NestedSlice(report, "checks")
	checks := make([]types.AuditCheck, 0)
	for _, c := range checksRaw {
		cMap, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		check := parseAuditCheck(cMap)
		if !check.Success {
			checks = append(checks, check)
		}
	}

	// Sort checks by severity.
	sort.Slice(checks, func(i, j int) bool {
		return severityRank(checks[i].Severity) < severityRank(checks[j].Severity)
	})

	updateTimestamp, _ := nestedString(report, "updateTimestamp")

	return types.AuditReport{
		ResourceKind:      labels["trivy-operator.resource.kind"],
		ResourceName:      labels["trivy-operator.resource.name"],
		ResourceNamespace: labels["trivy-operator.resource.namespace"],
		Summary:           auditSummary,
		Checks:            checks,
		LastScanned:       updateTimestamp,
		ReportName:        item.GetName(),
	}
}

func parseAuditCheck(c map[string]interface{}) types.AuditCheck {
	checkID, _ := c["checkID"].(string)
	title, _ := c["title"].(string)
	severity, _ := c["severity"].(string)
	category, _ := c["category"].(string)
	description, _ := c["description"].(string)
	remediation, _ := c["remediation"].(string)
	success, _ := c["success"].(bool)

	var messages []string
	if msgsRaw, ok := c["messages"].([]interface{}); ok {
		for _, m := range msgsRaw {
			if s, ok := m.(string); ok {
				messages = append(messages, s)
			}
		}
	}

	var scope string
	if scopeMap, ok := c["scope"].(map[string]interface{}); ok {
		scope, _ = scopeMap["value"].(string)
	}

	return types.AuditCheck{
		CheckID:     checkID,
		Title:       title,
		Severity:    severity,
		Category:    category,
		Description: description,
		Messages:    messages,
		Remediation: remediation,
		Success:     success,
		Scope:       scope,
	}
}

func severityRank(s string) int {
	switch s {
	case "CRITICAL":
		return 0
	case "HIGH":
		return 1
	case "MEDIUM":
		return 2
	case "LOW":
		return 3
	default:
		return 4
	}
}
