package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"text/template"
	"time"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/config"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
)

// Dashboard serves dashboard configuration and graph data.
type Dashboard struct {
	prom *prometheus.Client
	cfg  *config.DashboardConfig
}

// NewDashboard creates a dashboard handler.
func NewDashboard(prom *prometheus.Client, cfg *config.DashboardConfig) *Dashboard {
	return &Dashboard{prom: prom, cfg: cfg}
}

// HandleConfig serves GET /api/v1/dashboards?application=...&groupKind=...
// Returns the dashboard config (tabs, rows, graphs metadata) for the UI to render.
func (h *Dashboard) HandleConfig(w http.ResponseWriter, r *http.Request) {
	applicationName := r.URL.Query().Get("application")
	groupKind := strings.ToLower(r.URL.Query().Get("groupKind"))

	if groupKind == "" {
		groupKind = "deployment"
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("dashboard config request", "application", applicationName, "groupKind", groupKind, "user", username)

	app := h.cfg.App(applicationName)
	if app == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"tabs":      []string{},
			"rows":      []interface{}{},
			"intervals": []string{"1h", "6h", "24h", "7d"},
		})
		return
	}

	dashboard := app.DashboardFor(groupKind)
	if dashboard == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"tabs":      []string{},
			"rows":      []interface{}{},
			"intervals": []string{"1h", "6h", "24h", "7d"},
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

// graphDataResponse is the JSON response for a single graph's data.
type graphDataResponse struct {
	Series []graphSeries `json:"series"`
}

type graphSeries struct {
	Label  string       `json:"label"`
	Values []graphPoint `json:"values"`
}

type graphPoint struct {
	Time  string   `json:"time"`
	Value *float64 `json:"value"` // nil for gaps
}

// HandleGraph serves GET /api/v1/graph?application=...&groupKind=...&row=...&graph=...&namespace=...&name=...&duration=...
// Executes the PromQL template for a specific graph and returns time series data.
func (h *Dashboard) HandleGraph(w http.ResponseWriter, r *http.Request) {
	applicationName := r.URL.Query().Get("application")
	groupKind := strings.ToLower(r.URL.Query().Get("groupKind"))
	rowName := r.URL.Query().Get("row")
	graphName := r.URL.Query().Get("graph")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	duration := r.URL.Query().Get("duration")

	if groupKind == "" {
		groupKind = "deployment"
	}
	if duration == "" {
		duration = "1h"
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("graph data request",
		"application", applicationName, "groupKind", groupKind,
		"row", rowName, "graph", graphName,
		"namespace", namespace, "name", name,
		"duration", duration, "user", username,
	)

	// Find graph config
	app := h.cfg.App(applicationName)
	if app == nil {
		http.Error(w, `{"error":"application not found in config"}`, http.StatusNotFound)
		return
	}
	dashboard := app.DashboardFor(groupKind)
	if dashboard == nil {
		http.Error(w, `{"error":"no dashboard for this groupKind"}`, http.StatusNotFound)
		return
	}
	row := dashboard.FindRow(rowName)
	if row == nil {
		http.Error(w, `{"error":"row not found"}`, http.StatusNotFound)
		return
	}
	graph := row.FindGraph(graphName)
	if graph == nil {
		http.Error(w, `{"error":"graph not found"}`, http.StatusNotFound)
		return
	}

	// Build template variables from all query parameters
	vars := make(map[string]string)
	for k, v := range r.URL.Query() {
		if len(v) > 0 {
			vars[k] = v[0]
		}
	}

	// For workloads, name should match pods: "name-.*"
	// For pods, name should match exactly: "name"
	// The query template handles this via the config (pod=~ vs pod=)

	// Execute PromQL template
	query, err := renderTemplate(graph.QueryExpression, vars)
	if err != nil {
		slog.Error("template render failed", "error", err, "expression", graph.QueryExpression)
		http.Error(w, fmt.Sprintf(`{"error":"template error: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	slog.Debug("executing graph query", "query", query, "duration", duration)

	end := time.Now()
	start, step := rangeParams(duration, end)

	allSeries, err := h.prom.QueryRange(r.Context(), query, start, end, step)
	if err != nil {
		slog.Warn("graph query failed", "graph", graphName, "error", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(graphDataResponse{Series: []graphSeries{}})
		return
	}

	// Build shared timestamp grid
	var timestamps []time.Time
	for t := start; !t.After(end); t = t.Add(step) {
		timestamps = append(timestamps, t)
	}

	resp := graphDataResponse{}
	for _, s := range allSeries {
		// Use the metricName label as the series label
		label := s.Metric[graph.MetricName]
		if label == "" {
			// Fallback to any identifying label
			label = seriesLabel(s.Metric)
		}

		// Build value map for alignment
		valMap := make(map[int64]float64)
		for _, dp := range s.Values {
			valMap[dp.Time.Unix()] = convertValueForUnit(dp.Value, graph.YAxisUnit)
		}

		// Align to timestamp grid
		gs := graphSeries{Label: label}
		for _, t := range timestamps {
			timeStr := t.UTC().Format(time.RFC3339)
			if v, ok := valMap[t.Unix()]; ok {
				val := v
				gs.Values = append(gs.Values, graphPoint{Time: timeStr, Value: &val})
			} else {
				gs.Values = append(gs.Values, graphPoint{Time: timeStr, Value: nil})
			}
		}
		resp.Series = append(resp.Series, gs)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// renderTemplate executes a Go text/template with the given variables.
func renderTemplate(expression string, vars map[string]string) (string, error) {
	tmpl, err := template.New("query").Parse(expression)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, vars); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}
	return buf.String(), nil
}

// convertValueForUnit converts raw Prometheus values based on the display unit.
func convertValueForUnit(val float64, unit string) float64 {
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
