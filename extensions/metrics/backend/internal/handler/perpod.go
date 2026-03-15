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

// PerPod handles per-pod time series requests for multi-line charts.
type PerPod struct {
	prom *prometheus.Client
}

// NewPerPod creates a per-pod time series handler.
func NewPerPod(prom *prometheus.Client) *PerPod {
	return &PerPod{prom: prom}
}

type perPodSeries struct {
	Metric string        `json:"metric"`
	Unit   string        `json:"unit"`
	Pods   []podTimeline `json:"pods"`
}

type podTimeline struct {
	Pod    string      `json:"pod"`
	Series []dataPoint `json:"series"`
}

// Handle serves GET /api/v1/per-pod-series.
// Query params: namespace, name, kind, range, pods (optional comma-separated list).
func (h *PerPod) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	kind := r.URL.Query().Get("kind")
	timeRange := r.URL.Query().Get("range")
	podsParam := r.URL.Query().Get("pods")

	if namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}
	if timeRange == "" {
		timeRange = "1h"
	}
	if kind == "" {
		kind = "Deployment"
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("per-pod series", "namespace", namespace, "name", name, "kind", kind, "range", timeRange, "user", username)

	end := time.Now()
	start, step := rangeParams(timeRange, end)

	// Build pod selector
	var podSelector string
	if podsParam != "" {
		// Explicit pod list from resource tree
		pods := strings.Split(podsParam, ",")
		podSelector = fmt.Sprintf(`namespace="%s",pod=~"%s"`, namespace, strings.Join(pods, "|"))
	} else if name != "" {
		podSelector = podSelectorForKind(namespace, name, kind)
	} else {
		podSelector = fmt.Sprintf(`namespace="%s"`, namespace)
	}

	type metricDef struct {
		name  string
		query string
		unit  string
	}

	metrics := []metricDef{
		{
			name:  "CPU Usage",
			query: fmt.Sprintf(`sum by (pod) (rate(container_cpu_usage_seconds_total{%s,container!=""}[5m])) * 1000`, podSelector),
			unit:  "millicores",
		},
		{
			name:  "Memory Usage",
			query: fmt.Sprintf(`sum by (pod) (container_memory_working_set_bytes{%s,container!=""})`, podSelector),
			unit:  "bytes",
		},
	}

	var results []perPodSeries

	for _, m := range metrics {
		allSeries, err := h.prom.QueryRange(r.Context(), m.query, start, end, step)
		if err != nil {
			slog.Warn("per-pod range query failed", "metric", m.name, "error", err)
			results = append(results, perPodSeries{Metric: m.name, Unit: displayUnit(m.unit), Pods: []podTimeline{}})
			continue
		}

		pps := perPodSeries{Metric: m.name, Unit: displayUnit(m.unit)}
		for _, s := range allSeries {
			podName := s.Metric["pod"]
			if podName == "" {
				continue
			}
			pt := podTimeline{Pod: podName}
			for _, dp := range s.Values {
				pt.Series = append(pt.Series, dataPoint{
					Time:  dp.Time.UTC().Format(time.RFC3339),
					Value: convertValue(dp.Value, m.unit),
				})
			}
			pps.Pods = append(pps.Pods, pt)
		}
		results = append(results, pps)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
