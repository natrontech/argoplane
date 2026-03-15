package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/query"
)

// Resource handles per-workload metric requests.
type Resource struct {
	prom *prometheus.Client
}

// NewResource creates a resource metrics handler.
func NewResource(prom *prometheus.Client) *Resource {
	return &Resource{prom: prom}
}

// instantMetric is returned for non-range queries.
type instantMetric struct {
	Name  string `json:"name"`
	Value string `json:"value"`
	Unit  string `json:"unit"`
}

// timeSeriesMetric is returned for range queries.
type timeSeriesMetric struct {
	Name   string      `json:"name"`
	Unit   string      `json:"unit"`
	Series []dataPoint `json:"series"`
}

type dataPoint struct {
	Time  string  `json:"time"`
	Value float64 `json:"value"`
}

// Handle serves GET /api/v1/resource-metrics.
func (h *Resource) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	kind := r.URL.Query().Get("kind")
	timeRange := r.URL.Query().Get("range")

	if namespace == "" || name == "" {
		http.Error(w, `{"error":"namespace and name are required"}`, http.StatusBadRequest)
		return
	}
	if kind == "" {
		kind = "Deployment"
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("resource metrics request", "namespace", namespace, "name", name, "kind", kind, "range", timeRange, "user", username)

	queries := query.ResourceMetrics(namespace, name, kind)
	w.Header().Set("Content-Type", "application/json")

	if timeRange != "" {
		h.handleRange(w, r, queries, timeRange)
	} else {
		h.handleInstant(w, r, queries)
	}
}

func (h *Resource) handleInstant(w http.ResponseWriter, r *http.Request, queries []query.NamedQuery) {
	var results []instantMetric

	for _, q := range queries {
		samples, err := h.prom.Query(r.Context(), q.Query)
		if err != nil {
			slog.Warn("query failed", "name", q.Name, "error", err)
			results = append(results, instantMetric{
				Name:  q.Name,
				Value: "-",
				Unit:  q.Unit,
			})
			continue
		}

		val := 0.0
		if len(samples) > 0 {
			val = samples[0].Value
		}

		results = append(results, instantMetric{
			Name:  q.Name,
			Value: formatValue(val, q.Unit),
			Unit:  displayUnit(q.Unit),
		})
	}

	json.NewEncoder(w).Encode(results)
}

func (h *Resource) handleRange(w http.ResponseWriter, r *http.Request, queries []query.NamedQuery, timeRange string) {
	end := time.Now()
	start, step := rangeParams(timeRange, end)

	var results []timeSeriesMetric

	for _, q := range queries {
		// Skip restarts for range (it's a counter, not a rate)
		if q.Name == "Restarts" {
			continue
		}

		series, err := h.prom.QueryRange(r.Context(), q.Query, start, end, step)
		if err != nil {
			slog.Warn("range query failed", "name", q.Name, "error", err)
			results = append(results, timeSeriesMetric{
				Name:   q.Name,
				Unit:   displayUnit(q.Unit),
				Series: []dataPoint{},
			})
			continue
		}

		tsm := timeSeriesMetric{
			Name: q.Name,
			Unit: displayUnit(q.Unit),
		}

		if len(series) > 0 {
			for _, dp := range series[0].Values {
				tsm.Series = append(tsm.Series, dataPoint{
					Time:  dp.Time.UTC().Format(time.RFC3339),
					Value: convertValue(dp.Value, q.Unit),
				})
			}
		}
		results = append(results, tsm)
	}

	json.NewEncoder(w).Encode(results)
}

func rangeParams(timeRange string, end time.Time) (start time.Time, step time.Duration) {
	switch timeRange {
	case "6h":
		return end.Add(-6 * time.Hour), 3 * time.Minute
	case "24h":
		return end.Add(-24 * time.Hour), 12 * time.Minute
	case "7d":
		return end.Add(-7 * 24 * time.Hour), 1 * time.Hour
	default: // "1h"
		return end.Add(-1 * time.Hour), 30 * time.Second
	}
}

func formatValue(val float64, unit string) string {
	if math.IsNaN(val) || math.IsInf(val, 0) {
		return "0"
	}
	switch unit {
	case "millicores":
		if val >= 1000 {
			return fmt.Sprintf("%.2f", val/1000)
		}
		return fmt.Sprintf("%.1f", val)
	case "bytes":
		return formatBytes(val)
	case "bytes/s":
		return formatBytes(val)
	case "count":
		return fmt.Sprintf("%.0f", val)
	default:
		return fmt.Sprintf("%.2f", val)
	}
}

func displayUnit(unit string) string {
	switch unit {
	case "millicores":
		return "millicores"
	case "bytes":
		return "MiB"
	case "bytes/s":
		return "KB/s"
	case "count":
		return ""
	default:
		return unit
	}
}

func convertValue(val float64, unit string) float64 {
	if math.IsNaN(val) || math.IsInf(val, 0) {
		return 0
	}
	switch unit {
	case "bytes":
		return val / (1024 * 1024) // to MiB
	case "bytes/s":
		return val / 1024 // to KB/s
	default:
		return val
	}
}

func formatBytes(val float64) string {
	if val >= 1024*1024*1024 {
		return fmt.Sprintf("%.2f", val/(1024*1024*1024))
	}
	if val >= 1024*1024 {
		return fmt.Sprintf("%.1f", val/(1024*1024))
	}
	if val >= 1024 {
		return fmt.Sprintf("%.1f", val/1024)
	}
	return fmt.Sprintf("%.0f", val)
}
