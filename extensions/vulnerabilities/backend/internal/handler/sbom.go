package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/vulnerabilities/backend/internal/types"
)

// SbomHandler handles SBOM report queries.
type SbomHandler struct {
	client dynamic.Interface
}

// NewSbomHandler creates a new SbomHandler.
func NewSbomHandler(client dynamic.Interface) *SbomHandler {
	return &SbomHandler{client: client}
}

// HandleOverview returns SBOM data for all images in a namespace.
func (h *SbomHandler) HandleOverview(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if req.Namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	list, err := h.client.Resource(types.SbomReportGVR).Namespace(req.Namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list sbom reports", "error", err, "namespace", req.Namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list sbom reports")
		return
	}

	totalComponents := 0
	reports := make([]types.SbomReport, 0, len(list.Items))

	for _, item := range list.Items {
		report := parseSbomReport(item)
		totalComponents += report.ComponentsCount
		reports = append(reports, report)
	}

	WriteJSON(w, types.SbomOverviewResponse{
		Reports:         reports,
		TotalComponents: totalComponents,
		Namespace:       req.Namespace,
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
