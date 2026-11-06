package handler

import (
	"encoding/json"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// SbomHandler handles SBOM report queries.
type SbomHandler struct {
	clients Clients
	auth    *Authorizer
}

// NewSbomHandler creates a new SbomHandler.
func NewSbomHandler(clients Clients, auth *Authorizer) *SbomHandler {
	return &SbomHandler{clients: clients, auth: auth}
}

// HandleOverview returns SBOM data for all images in a namespace.
func (h *SbomHandler) HandleOverview(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Namespace string   `json:"namespace"`
		Resources []string `json:"resources,omitempty"`
	}
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

	auditLog(r, "sbom.overview", req.Namespace)

	var truncated bool
	listOpts := metav1.ListOptions{LabelSelector: resourceLabelSelector(req.Resources)}
	cl, err := clientFor(h.clients, r)
	if err != nil {
		WriteError(w, http.StatusBadGateway, "cannot reach the cluster this application deploys to")
		return
	}
	reportList := cl.Resource(types.SbomReportGVR).Namespace(req.Namespace).List

	totalComponents := 0
	reports := make([]types.SbomReport, 0, 0)

	// Deduplicate by image:tag (same image in old/new ReplicaSets).
	seen := make(map[string]bool)
	for item, err := range eachReport(r.Context(), reportList, listOpts, &truncated) {
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "failed to list sbom reports")
			return
		}
		report := parseSbomReport(item)
		imageKey := report.Registry + "/" + report.Image + ":" + report.Tag
		if seen[imageKey] {
			continue
		}
		seen[imageKey] = true

		totalComponents += report.ComponentsCount
		reports = append(reports, report)
	}

	WriteJSON(w, types.SbomOverviewResponse{
		Reports:         reports,
		TotalComponents: totalComponents,
		Namespace:       req.Namespace,
		Truncated:       truncated,
	})
}

func parseSbomReport(item unstructured.Unstructured) types.SbomReport {
	labels := item.GetLabels()
	report, _, _ := unstructured.NestedMap(item.Object, "report")

	artifact, _ := nestedMap(report, "artifact")
	registry, _ := nestedMap(report, "registry")
	image, _ := nestedString(artifact, "repository")
	tag, _ := nestedString(artifact, "tag")
	registryServer, _ := nestedString(registry, "server")

	// Parse CycloneDX components.
	componentsObj, _ := nestedMap(report, "components")
	componentsRaw, _, _ := unstructured.NestedSlice(componentsObj, "components")

	components := make([]types.SbomComponent, 0, len(componentsRaw))
	for _, c := range componentsRaw {
		cMap, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		name, _ := cMap["name"].(string)
		version, _ := cMap["version"].(string)
		cType, _ := cMap["type"].(string)
		purl, _ := cMap["purl"].(string)

		components = append(components, types.SbomComponent{
			Name:    name,
			Version: version,
			Type:    cType,
			Purl:    purl,
		})
	}

	updateTimestamp, _ := nestedString(report, "updateTimestamp")

	return types.SbomReport{
		Image:             image,
		Tag:               tag,
		Registry:          registryServer,
		ContainerName:     labels["trivy-operator.container.name"],
		ResourceKind:      labels["trivy-operator.resource.kind"],
		ResourceName:      labels["trivy-operator.resource.name"],
		ResourceNamespace: labels["trivy-operator.resource.namespace"],
		ReportName:        item.GetName(),
		Components:        components,
		ComponentsCount:   len(components),
		LastScanned:       updateTimestamp,
	}
}
