package handler

import (
	"log/slog"
	"net/http"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// StorageHandler handles requests for Velero backup storage locations.
type StorageHandler struct {
	client         dynamic.Interface
	veleroNamespace string
}

// NewStorageHandler creates a new StorageHandler.
func NewStorageHandler(client dynamic.Interface, veleroNamespace string) *StorageHandler {
	return &StorageHandler{client: client, veleroNamespace: veleroNamespace}
}

// Handle lists all BackupStorageLocations.
func (h *StorageHandler) Handle(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("Argocd-Username")
	slog.Debug("storage locations request", "user", username)

	list, err := h.client.Resource(types.BSLGVR).Namespace(h.veleroNamespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list backup storage locations", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list backup storage locations")
		return
	}

	locations := make([]types.StorageLocationSummary, 0, len(list.Items))
	for _, item := range list.Items {
		locations = append(locations, parseStorageLocation(item))
	}

	WriteJSON(w, locations)
}

func parseStorageLocation(obj unstructured.Unstructured) types.StorageLocationSummary {
	provider, _, _ := unstructured.NestedString(obj.Object, "spec", "provider")
	bucket, _, _ := unstructured.NestedString(obj.Object, "spec", "objectStorage", "bucket")
	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")
	lastValidation, _, _ := unstructured.NestedString(obj.Object, "status", "lastValidationTime")

	return types.StorageLocationSummary{
		Name:               obj.GetName(),
		Namespace:          obj.GetNamespace(),
		Provider:           provider,
		Bucket:             bucket,
		Phase:              phase,
		LastValidationTime: lastValidation,
	}
}
