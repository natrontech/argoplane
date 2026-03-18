package handler

import (
	"encoding/json"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// SecretsHandler handles exposed secret report queries.
type SecretsHandler struct {
	client dynamic.Interface
}

// NewSecretsHandler creates a new SecretsHandler.
func NewSecretsHandler(client dynamic.Interface) *SecretsHandler {
	return &SecretsHandler{client: client}
}

// HandleOverview returns an aggregated exposed secret overview for a namespace.
func (h *SecretsHandler) HandleOverview(w http.ResponseWriter, r *http.Request) {
	if !requireAppHeader(w, r) {
		return
	}

	var req struct {
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if !validateNamespace(w, req.Namespace) {
		return
	}

	auditLog(r, "secrets.overview", req.Namespace)

	list, err := h.client.Resource(types.ExposedSecretReportGVR).Namespace(req.Namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to list exposed secret reports")
		return
	}

	totalSummary := types.VulnerabilitySummary{}
	reports := make([]types.SecretReport, 0, len(list.Items))

	// Deduplicate by image:tag (same image in old/new ReplicaSets).
	seen := make(map[string]bool)
	for _, item := range list.Items {
		report := parseSecretReport(item)
		imageKey := report.Registry + "/" + report.Image + ":" + report.Tag
		if seen[imageKey] {
			continue
		}
		seen[imageKey] = true

		totalSummary.Critical += report.Summary.Critical
		totalSummary.High += report.Summary.High
		totalSummary.Medium += report.Summary.Medium
		totalSummary.Low += report.Summary.Low
		reports = append(reports, report)
	}

	sort.Slice(reports, func(i, j int) bool {
		return severityScore(reports[i].Summary) > severityScore(reports[j].Summary)
	})

	WriteJSON(w, types.SecretOverviewResponse{
		Summary:   totalSummary,
		Reports:   reports,
		Namespace: req.Namespace,
	})
}

func parseSecretReport(item unstructured.Unstructured) types.SecretReport {
	labels := item.GetLabels()
	report, _, _ := unstructured.NestedMap(item.Object, "report")

	artifact, _ := nestedMap(report, "artifact")
	registry, _ := nestedMap(report, "registry")
	image, _ := nestedString(artifact, "repository")
	tag, _ := nestedString(artifact, "tag")
	registryServer, _ := nestedString(registry, "server")

	summary, _ := nestedMap(report, "summary")
	secretSummary := types.VulnerabilitySummary{
		Critical: nestedInt(summary, "criticalCount"),
		High:     nestedInt(summary, "highCount"),
		Medium:   nestedInt(summary, "mediumCount"),
		Low:      nestedInt(summary, "lowCount"),
	}

	secretsRaw, _, _ := unstructured.NestedSlice(report, "secrets")
	secrets := make([]types.ExposedSecret, 0, len(secretsRaw))
	for _, s := range secretsRaw {
		sMap, ok := s.(map[string]interface{})
		if !ok {
			continue
		}
		ruleID, _ := sMap["ruleID"].(string)
		title, _ := sMap["title"].(string)
		severity, _ := sMap["severity"].(string)
		category, _ := sMap["category"].(string)
		match, _ := sMap["match"].(string)
		target, _ := sMap["target"].(string)

		secrets = append(secrets, types.ExposedSecret{
			RuleID:   ruleID,
			Title:    title,
			Severity: severity,
			Category: category,
			Match:    match,
			Target:   target,
		})
	}

	updateTimestamp, _ := nestedString(report, "updateTimestamp")

	return types.SecretReport{
		Image:             image,
		Tag:               tag,
		Registry:          registryServer,
		ContainerName:     labels["trivy-operator.container.name"],
		ResourceKind:      labels["trivy-operator.resource.kind"],
		ResourceName:      labels["trivy-operator.resource.name"],
		ResourceNamespace: labels["trivy-operator.resource.namespace"],
		ReportName:        item.GetName(),
		Summary:           secretSummary,
		Secrets:           secrets,
		LastScanned:       updateTimestamp,
	}
}
