package handler

import (
	"context"
	"iter"
	"log/slog"
	"net/http"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// ReportsHandler handles vulnerability report queries.
type ReportsHandler struct {
	clients Clients
	auth    *Authorizer
}

// NewReportsHandler creates a new ReportsHandler.
func NewReportsHandler(clients Clients, auth *Authorizer) *ReportsHandler {
	return &ReportsHandler{clients: clients, auth: auth}
}

// Handle returns vulnerability reports filtered by namespace.
// Optional query params: resource (e.g. "guestbook-ui-84774bdc6f"), kind (e.g. "ReplicaSet").
func (h *ReportsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if !validateNamespace(w, namespace) {
		return
	}
	if !h.auth.AuthorizeNamespace(w, r, namespace) {
		return
	}

	resourceFilter := r.URL.Query().Get("resource")
	kindFilter := r.URL.Query().Get("kind")

	auditLog(r, "vulnerability.reports", namespace, "resource", resourceFilter, "kind", kindFilter)

	var truncated bool
	opts := metav1.ListOptions{LabelSelector: resourceLabelSelector(nonEmpty(resourceFilter))}
	reports := make([]types.ImageReport, 0)
	cl, err := clientFor(h.clients, h.auth, r)
	if err != nil {
		WriteError(w, http.StatusBadGateway, "cannot reach the cluster this application deploys to")
		return
	}
	for item, err := range eachReport(r.Context(), cl.Resource(types.VulnerabilityReportGVR).Namespace(namespace).List, opts, &truncated) {
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to list vulnerability reports")
			return
		}
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

// Trivy reports are listed a page at a time and only their parsed form is
// kept, so one page of raw objects (SBOMs can be several MB each) bounds
// memory. maxReports caps a single request; hitting it marks the response
// truncated.
const (
	reportPageSize = 100
	maxReports     = 5000
)

// listFunc is the List method of a dynamic resource client.
type listFunc func(ctx context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error)

// eachReport yields every report matching opts, following Continue tokens.
// A List error is yielded once and ends the sequence. After maxReports it
// stops and sets *truncated.
func eachReport(ctx context.Context, list listFunc, opts metav1.ListOptions, truncated *bool) iter.Seq2[unstructured.Unstructured, error] {
	return func(yield func(unstructured.Unstructured, error) bool) {
		opts.Limit = reportPageSize
		n := 0
		for {
			page, err := list(ctx, opts)
			if err != nil {
				yield(unstructured.Unstructured{}, err)
				return
			}
			for _, item := range page.Items {
				if n == maxReports {
					*truncated = true
					slog.Warn("report list truncated", "max", maxReports)
					return
				}
				n++
				if !yield(item, nil) {
					return
				}
			}
			if page.GetContinue() == "" {
				return
			}
			opts.Continue = page.GetContinue()
		}
	}
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
	if obj == nil {
		return nil, false
	}
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

// nonEmpty returns []string{s}, or nil for "" so no selector is built.
func nonEmpty(s string) []string {
	if s == "" {
		return nil
	}
	return []string{s}
}
