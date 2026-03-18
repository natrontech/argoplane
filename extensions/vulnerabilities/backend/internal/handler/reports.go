package handler

import (
	"log/slog"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// ReportsHandler handles vulnerability report queries.
type ReportsHandler struct {
	client dynamic.Interface
}

// NewReportsHandler creates a new ReportsHandler.
func NewReportsHandler(client dynamic.Interface) *ReportsHandler {
	return &ReportsHandler{client: client}
}

// Handle returns vulnerability reports filtered by namespace.
// Optional query params: resource (e.g. "guestbook-ui-84774bdc6f"), kind (e.g. "ReplicaSet").
func (h *ReportsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	resourceFilter := r.URL.Query().Get("resource")
	kindFilter := r.URL.Query().Get("kind")

	slog.Debug("listing vulnerability reports", "namespace", namespace, "resource", resourceFilter, "kind", kindFilter)

	list, err := h.client.Resource(types.VulnerabilityReportGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list vulnerability reports", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list vulnerability reports")
		return
	}

	reports := make([]types.ImageReport, 0, len(list.Items))
	for _, item := range list.Items {
		report := parseReport(item)

		if resourceFilter != "" && report.ResourceName != resourceFilter {
			continue
		}
		if kindFilter != "" && report.ResourceKind != kindFilter {
			continue
		}

		reports = append(reports, report)
	}

	// Sort by severity (most critical first).
	sort.Slice(reports, func(i, j int) bool {
		return severityScore(reports[i].Summary) > severityScore(reports[j].Summary)
	})

	WriteJSON(w, reports)
}

func severityScore(s types.VulnerabilitySummary) int {
	return s.Critical*10000 + s.High*100 + s.Medium*10 + s.Low
}

func parseReport(item unstructured.Unstructured) types.ImageReport {
	labels := item.GetLabels()
	report, _, _ := unstructured.NestedMap(item.Object, "report")

	// Parse artifact info.
	artifact, _ := nestedMap(report, "artifact")
	registry, _ := nestedMap(report, "registry")

	image, _ := nestedString(artifact, "repository")
	tag, _ := nestedString(artifact, "tag")
	registryServer, _ := nestedString(registry, "server")

	// Parse summary.
	summary, _ := nestedMap(report, "summary")
	vulnSummary := types.VulnerabilitySummary{
		Critical: nestedInt(summary, "criticalCount"),
		High:     nestedInt(summary, "highCount"),
		Medium:   nestedInt(summary, "mediumCount"),
		Low:      nestedInt(summary, "lowCount"),
		Unknown:  nestedInt(summary, "unknownCount"),
	}

	// Parse vulnerabilities.
	vulnsRaw, _, _ := unstructured.NestedSlice(report, "vulnerabilities")
	vulns := make([]types.Vulnerability, 0, len(vulnsRaw))
	fixable := 0
	for _, v := range vulnsRaw {
		vMap, ok := v.(map[string]interface{})
		if !ok {
			continue
		}
		vuln := parseVulnerability(vMap)
		if vuln.FixedVersion != "" {
			fixable++
		}
		vulns = append(vulns, vuln)
	}

	// Sort vulnerabilities by score descending.
	sort.Slice(vulns, func(i, j int) bool {
		return vulns[i].Score > vulns[j].Score
	})

	updateTimestamp, _ := nestedString(report, "updateTimestamp")

	return types.ImageReport{
		Image:             image,
		Tag:               tag,
		Registry:          registryServer,
		Summary:           vulnSummary,
		Fixable:           fixable,
		LastScanned:       updateTimestamp,
		ContainerName:     labels["trivy-operator.container.name"],
		ResourceKind:      labels["trivy-operator.resource.kind"],
		ResourceName:      labels["trivy-operator.resource.name"],
		ResourceNamespace: labels["trivy-operator.resource.namespace"],
		ReportName:        item.GetName(),
		Vulnerabilities:   vulns,
	}
}

func parseVulnerability(v map[string]interface{}) types.Vulnerability {
	id, _ := v["vulnerabilityID"].(string)
	severity, _ := v["severity"].(string)
	score, _ := v["score"].(float64)
	pkg, _ := v["resource"].(string)
	installed, _ := v["installedVersion"].(string)
	fixed, _ := v["fixedVersion"].(string)
	title, _ := v["title"].(string)
	link, _ := v["primaryLink"].(string)
	target, _ := v["target"].(string)

	return types.Vulnerability{
		ID:               id,
		Severity:         severity,
		Score:            score,
		Package:          pkg,
		InstalledVersion: installed,
		FixedVersion:     fixed,
		Title:            title,
		PrimaryLink:      link,
		Target:           target,
	}
}

// Helper functions for unstructured access.

func nestedMap(obj map[string]interface{}, key string) (map[string]interface{}, bool) {
	v, ok := obj[key]
	if !ok {
		return nil, false
	}
	m, ok := v.(map[string]interface{})
	return m, ok
}

func nestedString(obj map[string]interface{}, key string) (string, bool) {
	if obj == nil {
		return "", false
	}
	v, ok := obj[key]
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

func nestedInt(obj map[string]interface{}, key string) int {
	if obj == nil {
		return 0
	}
	v, ok := obj[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case int64:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}
