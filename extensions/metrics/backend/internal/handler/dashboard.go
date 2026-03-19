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
	Series     []graphSeries     `json:"series"`
	Thresholds []thresholdResult `json:"thresholds,omitempty"`
}

// thresholdResult is a resolved threshold with its current value.
type thresholdResult struct {
	Name  string  `json:"name"`
	Color string  `json:"color"`
	Value float64 `json:"value"`
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

	// Set podFilter: if specific pods are requested, use them as a regex OR;
	// otherwise fall back to the name pattern (e.g., "deployment-name-.*").
	pods := r.URL.Query().Get("pods")
	if pods != "" {
		// Escape dots in pod names for regex safety, join with |
		podNames := strings.Split(pods, ",")
		for i, p := range podNames {
			podNames[i] = strings.TrimSpace(p)
		}
		vars["podFilter"] = strings.Join(podNames, "|")
	} else if vars["name"] != "" {
		vars["podFilter"] = vars["name"]
	}

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

	resp := graphDataResponse{Series: []graphSeries{}}
	for _, s := range allSeries {
		// Use the metricName label as the series label
		label := s.Metric[graph.MetricName]
		if label == "" {
			// Fallback to any identifying label
			label = seriesLabel(s.Metric)
		}

		// Use Prometheus-returned timestamps directly instead of building a
		// synthetic grid. Prometheus aligns query_range steps to UTC epoch
		// boundaries, which may not match a grid built from time.Now().
		gs := graphSeries{Label: label}
		for _, dp := range s.Values {
			val := convertValueForUnit(dp.Value, graph.YAxisUnit)
			gs.Values = append(gs.Values, graphPoint{
				Time:  dp.Time.UTC().Format(time.RFC3339),
				Value: &val,
			})
		}
		resp.Series = append(resp.Series, gs)
	}

	// Resolve threshold values via instant queries
	for _, t := range graph.Thresholds {
		if t.QueryExpression == "" {
			continue
		}
		tQuery, err := renderTemplate(t.QueryExpression, vars)
		if err != nil {
			slog.Warn("threshold template render failed", "name", t.Name, "error", err)
			continue
		}
		samples, err := h.prom.Query(r.Context(), tQuery)
		if err != nil {
			slog.Warn("threshold query failed", "name", t.Name, "error", err)
			continue
		}
		if len(samples) == 0 {
			continue
		}
		val := convertValueForUnit(samples[0].Value, graph.YAxisUnit)
		if val > 0 {
			resp.Thresholds = append(resp.Thresholds, thresholdResult{
				Name:  t.Name,
				Color: t.Color,
				Value: val,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// seriesLabel builds a human-readable label from metric labels.
func seriesLabel(labels map[string]string) string {
	for _, key := range []string{"pod", "container", "namespace", "node", "instance"} {
		if v, ok := labels[key]; ok && v != "" {
			return fmt.Sprintf("%s=%s", key, v)
		}
	}
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
