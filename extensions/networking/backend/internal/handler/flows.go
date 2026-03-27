package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/networking/backend/internal/hubble"
)

// FlowsHandler handles requests for Hubble flow data. It uses a FlowBuffer
// to accumulate flows across requests so that short-lived flows are not lost
// between UI refresh intervals.
type FlowsHandler struct {
	buffer *hubble.FlowBuffer
}

// NewFlowsHandler creates a new FlowsHandler. If buffer is nil,
// the handler returns an empty response indicating Hubble is not configured.
func NewFlowsHandler(buffer *hubble.FlowBuffer) *FlowsHandler {
	return &FlowsHandler{buffer: buffer}
}

// Handle returns recent flows for a namespace from the flow buffer.
func (h *FlowsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	if h.buffer == nil {
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

	flows, err := h.buffer.Flows(r.Context(), hubble.FlowsRequest{
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

	// Filter by pod names if provided (app-scoped mode).
	if podsParam := r.URL.Query().Get("pods"); podsParam != "" {
		podSet := make(map[string]bool)
		for _, p := range strings.Split(podsParam, ",") {
			podSet[p] = true
		}
		filtered := make([]hubble.FlowSummary, 0, len(flows))
		for _, f := range flows {
			if podSet[f.SourcePod] || podSet[f.DestPod] {
				filtered = append(filtered, f)
			}
		}
		flows = filtered
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
