package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
)

// Labels handles label name and value discovery.
type Labels struct {
	prom *prometheus.Client
}

// NewLabels creates a labels handler.
func NewLabels(prom *prometheus.Client) *Labels {
	return &Labels{prom: prom}
}

// Handle serves GET /api/v1/labels.
// ?metric=container_cpu_usage_seconds_total&namespace=X returns label names for that metric.
// ?metric=...&label=namespace&namespace=X returns values for that label.
// Security: namespace is required to prevent cross-namespace enumeration.
func (h *Labels) Handle(w http.ResponseWriter, r *http.Request) {
	metric := r.URL.Query().Get("metric")
	label := r.URL.Query().Get("label")
	namespace := r.URL.Query().Get("namespace")

	if metric == "" {
		http.Error(w, `{"error":"metric is required"}`, http.StatusBadRequest)
		return
	}
	if namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if label != "" {
		// Return values for a specific label
		h.handleLabelValues(w, r, metric, label, namespace)
	} else {
		// Return label names for this metric
		h.handleLabelNames(w, r, metric, namespace)
	}
}

func (h *Labels) handleLabelNames(w http.ResponseWriter, r *http.Request, metric, namespace string) {
	query := fmt.Sprintf(`%s{namespace="%s"}`, metric, namespace)

	samples, err := h.prom.Query(r.Context(), query)
	if err != nil {
		slog.Warn("label names query failed", "metric", metric, "error", err)
		json.NewEncoder(w).Encode([]string{})
		return
	}

	// Collect unique label names from all samples
	nameSet := make(map[string]bool)
	for _, s := range samples {
		for k := range s.Metric {
			if k != "__name__" {
				nameSet[k] = true
			}
		}
	}

	var names []string
	for k := range nameSet {
		names = append(names, k)
	}
	json.NewEncoder(w).Encode(names)
}

func (h *Labels) handleLabelValues(w http.ResponseWriter, r *http.Request, metric, label, namespace string) {
	query := fmt.Sprintf(`%s{namespace="%s"}`, metric, namespace)

	samples, err := h.prom.Query(r.Context(), query)
	if err != nil {
		slog.Warn("label values query failed", "metric", metric, "label", label, "error", err)
		json.NewEncoder(w).Encode([]string{})
		return
	}

	// Collect unique values for the label
	valSet := make(map[string]bool)
	for _, s := range samples {
		if v, ok := s.Metric[label]; ok && v != "" {
			valSet[v] = true
		}
	}

	var values []string
	for v := range valSet {
		values = append(values, v)
	}
	json.NewEncoder(w).Encode(values)
}
