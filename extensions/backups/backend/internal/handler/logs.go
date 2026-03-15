package handler

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// LogsHandler creates Velero DownloadRequests and returns the pre-signed URL.
type LogsHandler struct {
	client          dynamic.Interface
	veleroNamespace string
}

// NewLogsHandler creates a new LogsHandler.
func NewLogsHandler(client dynamic.Interface, veleroNamespace string) *LogsHandler {
	return &LogsHandler{client: client, veleroNamespace: veleroNamespace}
}

// Handle creates a DownloadRequest for a backup or restore's logs/results and
// polls until the download URL is available.
//
// Query params:
//   - name: the backup or restore name (required)
//   - kind: one of BackupLog, RestoreLog, BackupResults, RestoreResults (required)
func (h *LogsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	kind := r.URL.Query().Get("kind")

	if name == "" || kind == "" {
		WriteError(w, http.StatusBadRequest, "name and kind are required")
		return
	}

	validKinds := map[string]bool{
		"BackupLog": true, "RestoreLog": true,
		"BackupResults": true, "RestoreResults": true,
	}
	if !validKinds[kind] {
		WriteError(w, http.StatusBadRequest, "kind must be one of: BackupLog, RestoreLog, BackupResults, RestoreResults")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Info("creating download request", "name", name, "kind", kind, "user", username)

	// Build a DNS-safe name: lowercase, max 63 chars (Kubernetes name limit).
	// Use a short hash of the full name to avoid collisions.
	ts := time.Now().Unix()
	raw := fmt.Sprintf("%s-%s-%d", name, strings.ToLower(kind), ts)
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(raw)))[:8]
	drName := fmt.Sprintf("ap-%s-%s", hash, strings.ToLower(kind))
	if len(drName) > 63 {
		drName = drName[:63]
	}

	dr := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "velero.io/v1",
			"kind":       "DownloadRequest",
			"metadata": map[string]interface{}{
				"name":      drName,
				"namespace": h.veleroNamespace,
			},
			"spec": map[string]interface{}{
				"target": map[string]interface{}{
					"kind": kind,
					"name": name,
				},
			},
		},
	}

	created, err := h.client.Resource(types.DownloadRequestGVR).Namespace(h.veleroNamespace).Create(r.Context(), dr, metav1.CreateOptions{})
	if err != nil {
		slog.Error("failed to create download request", "error", err, "name", drName)
		WriteError(w, http.StatusServiceUnavailable, fmt.Sprintf("Logs not available: %v. Velero DownloadRequest CRD may not be installed or Velero server is not running.", err))
		return
	}

	// Poll for the download URL (Velero fills it in status.downloadURL).
	url, err := h.pollDownloadURL(r.Context(), created.GetName())
	if err != nil {
		slog.Error("download request timed out", "error", err, "name", drName)
		WriteError(w, http.StatusGatewayTimeout, "download request timed out waiting for URL")
		return
	}

	// Clean up the DownloadRequest (best effort).
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = h.client.Resource(types.DownloadRequestGVR).Namespace(h.veleroNamespace).Delete(ctx, drName, metav1.DeleteOptions{})
	}()

	WriteJSON(w, map[string]string{
		"downloadURL": url,
	})
}

func (h *LogsHandler) pollDownloadURL(ctx context.Context, name string) (string, error) {
	deadline := time.After(30 * time.Second)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-deadline:
			return "", fmt.Errorf("timed out after 30s")
		case <-ticker.C:
			obj, err := h.client.Resource(types.DownloadRequestGVR).Namespace(h.veleroNamespace).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				continue
			}
			url, ok, _ := unstructured.NestedString(obj.Object, "status", "downloadURL")
			if ok && url != "" {
				return url, nil
			}
		}
	}
}
