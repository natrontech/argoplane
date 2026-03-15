package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/natrontech/argoplane/extensions/networking/backend/internal/hubble"
)

// FlowsHandler handles requests for Hubble flow data.
type FlowsHandler struct {
	hubbleClient *hubble.Client
}

// NewFlowsHandler creates a new FlowsHandler. If hubbleClient is nil,
// the handler returns an empty response indicating Hubble is not configured.
func NewFlowsHandler(hubbleClient *hubble.Client) *FlowsHandler {
	return &FlowsHandler{hubbleClient: hubbleClient}
}

// Handle returns recent flows for a namespace from Hubble Relay.
func (h *FlowsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	if h.hubbleClient == nil {
		WriteJSON(w, map[string]any{
			"flows":   []any{},
			"hubble":  false,
			"message": "Hubble Relay is not configured",
		})
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("flows request", "namespace", namespace, "user", username)

	sinceStr := r.URL.Query().Get("since")
	since := 5 * time.Minute
	if sinceStr != "" {
		if d, err := time.ParseDuration(sinceStr); err == nil {
			since = d
		}
	}

	limitStr := r.URL.Query().Get("limit")
	limit := int64(100)
	if limitStr != "" {
		if l, err := strconv.ParseInt(limitStr, 10, 64); err == nil && l > 0 {
			limit = l
		}
	}
	if limit > 1000 {
		limit = 1000
	}

	verdict := r.URL.Query().Get("verdict")
	direction := r.URL.Query().Get("direction")

	flows, err := h.hubbleClient.Flows(r.Context(), hubble.FlowsRequest{
		Namespace: namespace,
		Since:     since,
		Limit:     limit,
		Verdict:   verdict,
		Direction: direction,
	})
	if err != nil {
		slog.Error("failed to query hubble flows", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to query flows")
		return
	}

	// Compute verdict summary counts.
	var forwarded, dropped, errCount int
	for _, f := range flows {
		switch f.Verdict {
		case "FORWARDED":
			forwarded++
		case "DROPPED":
			dropped++
		case "ERROR":
			errCount++
		}
	}

	WriteJSON(w, map[string]any{
		"flows":  flows,
		"hubble": true,
		"summary": map[string]int{
			"total":     len(flows),
			"forwarded": forwarded,
			"dropped":   dropped,
			"error":     errCount,
		},
	})
}
