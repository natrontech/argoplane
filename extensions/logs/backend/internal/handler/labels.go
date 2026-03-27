package handler

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/logs/backend/internal/logql"
	"github.com/natrontech/argoplane/extensions/logs/backend/internal/loki"
)

// Labels handles label discovery requests.
type Labels struct {
	loki *loki.Client
}

// NewLabels creates a Labels handler.
func NewLabels(loki *loki.Client) *Labels {
	return &Labels{loki: loki}
}

// HandleLabels processes GET /api/v1/logs/labels requests.
// Security: requires namespace to prevent cross-namespace label enumeration.
func (h *Labels) HandleLabels(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		writeError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	end := time.Now()
	start := end.Add(-1 * time.Hour)
	if s := r.URL.Query().Get("start"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			start = t
		}
	}
	if e := r.URL.Query().Get("end"); e != "" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			end = t
		}
	}

	var query string
	if p := r.URL.Query().Get("pods"); p != "" {
		query = logql.ForPods(namespace, strings.Split(p, ","), "")
	} else {
		query = logql.ForNamespace(namespace, "")
	}
	labels, err := h.loki.LabelsWithQuery(r.Context(), query, start, end)
	if err != nil {
		slog.Warn("labels query failed", "error", err, "namespace", namespace)
		writeError(w, http.StatusBadGateway, "failed to query labels")
		return
	}

	writeJSON(w, labels)
}

// HandleLabelValues processes GET /api/v1/logs/label/{name}/values requests.
// Security: requires namespace to prevent cross-namespace value enumeration.
func (h *Labels) HandleLabelValues(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeError(w, http.StatusBadRequest, "label name is required")
		return
	}

	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		writeError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	end := time.Now()
	start := end.Add(-1 * time.Hour)
	if s := r.URL.Query().Get("start"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			start = t
		}
	}
	if e := r.URL.Query().Get("end"); e != "" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			end = t
		}
	}

	var query string
	if p := r.URL.Query().Get("pods"); p != "" {
		query = logql.ForPods(namespace, strings.Split(p, ","), "")
	} else {
		query = logql.ForNamespace(namespace, "")
	}

	values, err := h.loki.LabelValues(r.Context(), name, query, start, end)
	if err != nil {
		slog.Warn("label values query failed", "label", name, "error", err)
		writeError(w, http.StatusBadGateway, "failed to query label values")
		return
	}

	writeJSON(w, values)
}
