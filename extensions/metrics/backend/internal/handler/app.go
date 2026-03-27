package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/query"
)

// App handles application-level aggregate metric requests.
type App struct {
	prom *prometheus.Client
}

// NewApp creates an app metrics handler.
func NewApp(prom *prometheus.Client) *App {
	return &App{prom: prom}
}

// appResponse contains both instant summary and optional time series.
type appResponse struct {
	Summary    []instantMetric    `json:"summary"`
	TimeSeries []timeSeriesMetric `json:"timeSeries,omitempty"`
}

// Handle serves GET /api/v1/app-metrics.
func (h *App) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	timeRange := r.URL.Query().Get("range")

	if namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}

	var pods []string
	if p := r.URL.Query().Get("pods"); p != "" {
		pods = strings.Split(p, ",")
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("app metrics request", "namespace", namespace, "range", timeRange, "pods", len(pods), "user", username)

	queries := query.AppMetrics(namespace, pods)
	resp := appResponse{}

	// Instant summary
	for _, q := range queries {
		samples, err := h.prom.Query(r.Context(), q.Query)
		if err != nil {
			slog.Warn("app query failed", "name", q.Name, "error", err)
			resp.Summary = append(resp.Summary, instantMetric{
				Name:  q.Name,
				Value: "-",
				Unit:  displayUnit(q.Unit),
			})
			continue
		}

		val := 0.0
		if len(samples) > 0 {
			val = samples[0].Value
		}

		resp.Summary = append(resp.Summary, instantMetric{
			Name:  q.Name,
			Value: formatValue(val, q.Unit),
			Unit:  displayUnit(q.Unit),
		})
	}

	// Time series (if range requested, only CPU and Memory)
	if timeRange != "" {
		end := time.Now()
		start, step := rangeParams(timeRange, end)

		for _, q := range queries[:2] {
			series, err := h.prom.QueryRange(r.Context(), q.Query, start, end, step)
			if err != nil {
				slog.Warn("app range query failed", "name", q.Name, "error", err)
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
			resp.TimeSeries = append(resp.TimeSeries, tsm)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
