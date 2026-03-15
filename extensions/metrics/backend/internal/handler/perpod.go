package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
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
	Metric     string        `json:"metric"`
	Unit       string        `json:"unit"`
	Timestamps []string      `json:"timestamps"`
	Pods       []podTimeline `json:"pods"`
}

type podTimeline struct {
	Pod    string      `json:"pod"`
	Values []*float64  `json:"values"`
}

// Handle serves GET /api/v1/per-pod-series.
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

	// Build shared timestamp grid
	var timestamps []time.Time
	for t := start; !t.After(end); t = t.Add(step) {
		timestamps = append(timestamps, t)
	}
	tsStrings := make([]string, len(timestamps))
	for i, t := range timestamps {
		tsStrings[i] = t.UTC().Format(time.RFC3339)
	}

	// Build pod selector
	var podSelector string
	if podsParam != "" {
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
		{
			name:  "Network RX",
			query: fmt.Sprintf(`sum by (pod) (rate(container_network_receive_bytes_total{%s}[5m]))`, podSelector),
			unit:  "bytes/s",
		},
		{
			name:  "Network TX",
			query: fmt.Sprintf(`sum by (pod) (rate(container_network_transmit_bytes_total{%s}[5m]))`, podSelector),
			unit:  "bytes/s",
		},
	}

	var results []perPodSeries

	for _, m := range metrics {
		allSeries, err := h.prom.QueryRange(r.Context(), m.query, start, end, step)
		if err != nil {
			slog.Warn("per-pod range query failed", "metric", m.name, "error", err)
			results = append(results, perPodSeries{Metric: m.name, Unit: displayUnit(m.unit), Timestamps: tsStrings, Pods: []podTimeline{}})
			continue
		}

		pps := perPodSeries{Metric: m.name, Unit: displayUnit(m.unit), Timestamps: tsStrings, Pods: []podTimeline{}}

		for _, s := range allSeries {
			podName := s.Metric["pod"]
			if podName == "" {
				continue
			}

			// Build a map of timestamp -> value for this pod
			valMap := make(map[int64]float64)
			for _, dp := range s.Values {
				valMap[dp.Time.Unix()] = convertValue(dp.Value, m.unit)
			}

			// Align to the shared timestamp grid, nil for gaps
			values := make([]*float64, len(timestamps))
			for i, t := range timestamps {
				if v, ok := valMap[t.Unix()]; ok {
					val := v
					values[i] = &val
				}
			}

			pps.Pods = append(pps.Pods, podTimeline{Pod: podName, Values: values})
		}

		// Sort pods alphabetically for stable colors
		sort.Slice(pps.Pods, func(i, j int) bool {
			return pps.Pods[i].Pod < pps.Pods[j].Pod
		})

		results = append(results, pps)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
