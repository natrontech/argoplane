package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
)

// Custom handles user-defined PromQL queries.
type Custom struct {
	prom *prometheus.Client
}

// NewCustom creates a custom query handler.
func NewCustom(prom *prometheus.Client) *Custom {
	return &Custom{prom: prom}
}

type namedSeries struct {
	Label  string      `json:"label"`
	Series []dataPoint `json:"series"`
}

// Handle serves GET /api/v1/query.
func (h *Custom) Handle(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("query")
	timeRange := r.URL.Query().Get("range")

	if query == "" {
		http.Error(w, `{"error":"query is required"}`, http.StatusBadRequest)
		return
	}

	lower := strings.ToLower(query)
	if strings.Contains(lower, "delete") || strings.Contains(lower, "drop") {
		http.Error(w, `{"error":"query not allowed"}`, http.StatusForbidden)
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("custom query", "query", query, "range", timeRange, "user", username)

	w.Header().Set("Content-Type", "application/json")

	if timeRange != "" {
		end := time.Now()
		start, step := rangeParams(timeRange, end)

		allSeries, err := h.prom.QueryRange(r.Context(), query, start, end, step)
		if err != nil {
			slog.Warn("custom range query failed", "error", err)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":      err.Error(),
				"multiSeries": []namedSeries{},
			})
			return
		}

		var result []namedSeries
		for _, s := range allSeries {
			label := seriesLabel(s.Metric)
			ns := namedSeries{Label: label}
			for _, dp := range s.Values {
				ns.Series = append(ns.Series, dataPoint{
					Time:  dp.Time.UTC().Format(time.RFC3339),
					Value: dp.Value,
				})
			}
			result = append(result, ns)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"multiSeries": result})
	} else {
		samples, err := h.prom.Query(r.Context(), query)
		if err != nil {
			slog.Warn("custom query failed", "error", err)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   err.Error(),
				"samples": []interface{}{},
			})
			return
		}

		type sampleResult struct {
			Labels map[string]string `json:"labels"`
			Value  float64           `json:"value"`
		}
		var results []sampleResult
		for _, s := range samples {
			results = append(results, sampleResult{
				Labels: s.Metric,
				Value:  s.Value,
			})
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"samples": results})
	}
}

// seriesLabel builds a human-readable label from metric labels.
func seriesLabel(labels map[string]string) string {
	// Try common grouping labels
	for _, key := range []string{"pod", "container", "namespace", "node", "instance"} {
		if v, ok := labels[key]; ok && v != "" {
			return fmt.Sprintf("%s=%s", key, v)
		}
	}
	// Fallback: join all non-name labels
	var parts []string
	for k, v := range labels {
		if k != "__name__" {
			parts = append(parts, fmt.Sprintf("%s=%s", k, v))
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, ", ")
	}
	return "series"
}
