package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
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

// namespaceInQuery matches namespace="..." or namespace=~"..." label matchers in PromQL.
var namespaceInQuery = regexp.MustCompile(`namespace\s*[=!~]+\s*"([^"]*)"`)

// enforceNamespace validates and injects namespace scoping into a PromQL query.
// Returns the modified query or an error if the query targets a different namespace.
func enforceNamespace(query, namespace string) (string, error) {
	matches := namespaceInQuery.FindAllStringSubmatch(query, -1)
	if len(matches) > 0 {
		// Query already has namespace matchers. Validate they all match.
		for _, m := range matches {
			if len(m) > 1 && m[1] != namespace {
				return "", fmt.Errorf("query targets namespace %q but user is scoped to %q", m[1], namespace)
			}
		}
		return query, nil
	}

	// No namespace matcher found. Inject one into every label selector.
	// Replace `{` with `{namespace="X", ` and `metric_name{` with `metric_name{namespace="X", `.
	// If query has no selectors (bare metric name), append one.
	nsFilter := fmt.Sprintf(`namespace="%s"`, namespace)
	if strings.Contains(query, "{") {
		// Inject namespace into existing selectors.
		result := strings.ReplaceAll(query, "{", "{"+nsFilter+", ")
		// Clean up case where selector was empty: {namespace="X", }
		result = strings.ReplaceAll(result, ", }", "}")
		return result, nil
	}

	// Bare metric name or aggregation. Wrap is complex, so append a filter.
	// This handles simple cases like "up" -> "up{namespace=\"X\"}"
	// For complex expressions, the injected filter may not be syntactically correct,
	// but Prometheus will return an error which is safer than returning unscoped data.
	return query + fmt.Sprintf(`{%s}`, nsFilter), nil
}

// Handle serves GET /api/v1/query.
// Security: requires namespace parameter and enforces namespace scoping on all queries.
func (h *Custom) Handle(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("query")
	timeRange := r.URL.Query().Get("range")
	namespace := r.URL.Query().Get("namespace")

	if query == "" {
		http.Error(w, `{"error":"query is required"}`, http.StatusBadRequest)
		return
	}
	if namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}

	// Enforce namespace scoping.
	scopedQuery, err := enforceNamespace(query, namespace)
	if err != nil {
		slog.Warn("custom query rejected: namespace mismatch",
			"query", query, "namespace", namespace,
			"user", r.Header.Get("Argocd-Username"))
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusForbidden)
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("custom query", "query", scopedQuery, "original", query, "namespace", namespace, "range", timeRange, "user", username)

	w.Header().Set("Content-Type", "application/json")

	if timeRange != "" {
		end := time.Now()
		start, step := rangeParams(timeRange, end)

		allSeries, err := h.prom.QueryRange(r.Context(), scopedQuery, start, end, step)
		if err != nil {
			slog.Warn("custom range query failed", "error", err)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":       err.Error(),
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
		samples, err := h.prom.Query(r.Context(), scopedQuery)
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
