package handler

import (
	"encoding/json"
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

// Handle serves GET /api/v1/query.
func (h *Custom) Handle(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("query")
	timeRange := r.URL.Query().Get("range")

	if query == "" {
		http.Error(w, `{"error":"query is required"}`, http.StatusBadRequest)
		return
	}

	// Basic safety: reject queries that look like they modify state
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

		series, err := h.prom.QueryRange(r.Context(), query, start, end, step)
		if err != nil {
			slog.Warn("custom range query failed", "error", err)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":  err.Error(),
				"series": []dataPoint{},
			})
			return
		}

		var result []dataPoint
		if len(series) > 0 {
			for _, dp := range series[0].Values {
				result = append(result, dataPoint{
					Time:  dp.Time.UTC().Format(time.RFC3339),
					Value: dp.Value,
				})
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"series": result})
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
