package handler

import (
	"log/slog"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/networking/backend/internal/types"
)

// IdentitiesHandler handles requests for Cilium identity data.
type IdentitiesHandler struct {
	client dynamic.Interface
}

// NewIdentitiesHandler creates a new IdentitiesHandler.
func NewIdentitiesHandler(client dynamic.Interface) *IdentitiesHandler {
	return &IdentitiesHandler{client: client}
}

// Handle returns CiliumIdentities, optionally filtered by namespace.
func (h *IdentitiesHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	username := r.Header.Get("Argocd-Username")
	slog.Debug("identities request", "namespace", namespace, "user", username)

	list, err := h.client.Resource(types.CiliumIdentityGVR).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list cilium identities", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list identities")
		return
	}

	identities := make([]types.IdentitySummary, 0)
	for _, item := range list.Items {
		id := parseIdentitySummary(item)
		if namespace != "" {
			if ns, ok := id.Labels["k8s:io.kubernetes.pod.namespace"]; !ok || ns != namespace {
				continue
			}
		}
		identities = append(identities, id)
	}

	WriteJSON(w, identities)
}

func parseIdentitySummary(obj unstructured.Unstructured) types.IdentitySummary {
	is := types.IdentitySummary{
		ID:     obj.GetName(),
		Labels: make(map[string]string),
	}

	if labels, ok, _ := unstructured.NestedStringMap(obj.Object, "security-labels"); ok {
		is.Labels = labels
	}

	return is
}
