package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/query"
)

// Cluster handles cluster-wide metric requests.
type Cluster struct {
	prom *prometheus.Client
}

// NewCluster creates a cluster metrics handler.
func NewCluster(prom *prometheus.Client) *Cluster {
	return &Cluster{prom: prom}
}

// namespaceMetric represents one namespace in the top-N list.
type namespaceMetric struct {
	Namespace string  `json:"namespace"`
	CPU       float64 `json:"cpu"`
	Memory    float64 `json:"memory"`
}

// clusterResponse is the full cluster metrics response.
type clusterResponse struct {
	Summary    []instantMetric   `json:"summary"`
	TimeSeries []timeSeriesMetric `json:"timeSeries,omitempty"`
	Namespaces []namespaceMetric  `json:"namespaces"`
}

// Handle serves GET /api/v1/cluster-metrics.
func (h *Cluster) Handle(w http.ResponseWriter, r *http.Request) {
	timeRange := r.URL.Query().Get("range")

	username := r.Header.Get("Argocd-Username")
	slog.Debug("cluster metrics request", "range", timeRange, "user", username)

	queries := query.ClusterMetrics()

	resp := clusterResponse{}

	// Summary (instant)
	for _, q := range queries {
		samples, err := h.prom.Query(r.Context(), q.Query)
		if err != nil {
			slog.Warn("cluster query failed", "name", q.Name, "error", err)
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

	// Time series (if range requested)
	if timeRange != "" {
		end := time.Now()
		start, step := rangeParams(timeRange, end)

		// Only CPU and Memory for time series
		for _, q := range queries[:2] {
			series, err := h.prom.QueryRange(r.Context(), q.Query, start, end, step)
			if err != nil {
				slog.Warn("cluster range query failed", "name", q.Name, "error", err)
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

	// Top namespaces by CPU
	cpuQuery := query.TopNamespacesQuery("cpu")
	cpuSamples, err := h.prom.Query(r.Context(), cpuQuery.Query)
	if err != nil {
		slog.Warn("top namespaces CPU query failed", "error", err)
	}

	memQuery := query.TopNamespacesQuery("memory")
	memSamples, err := h.prom.Query(r.Context(), memQuery.Query)
	if err != nil {
		slog.Warn("top namespaces memory query failed", "error", err)
	}

	// Build namespace map
	nsMap := make(map[string]*namespaceMetric)
	for _, s := range cpuSamples {
		ns := s.Metric["namespace"]
		if ns == "" {
			continue
		}
		nsMap[ns] = &namespaceMetric{
			Namespace: ns,
			CPU:       s.Value,
		}
	}
	for _, s := range memSamples {
		ns := s.Metric["namespace"]
		if ns == "" {
			continue
		}
		if m, ok := nsMap[ns]; ok {
			m.Memory = s.Value / (1024 * 1024) // to MiB
		} else {
			nsMap[ns] = &namespaceMetric{
				Namespace: ns,
				Memory:    s.Value / (1024 * 1024),
			}
		}
	}
	for _, m := range nsMap {
		resp.Namespaces = append(resp.Namespaces, *m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
