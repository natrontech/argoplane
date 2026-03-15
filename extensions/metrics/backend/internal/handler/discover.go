package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sort"
	"strings"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
)

// Discover handles metric name discovery requests.
type Discover struct {
	prom *prometheus.Client
}

// NewDiscover creates a discovery handler.
func NewDiscover(prom *prometheus.Client) *Discover {
	return &Discover{prom: prom}
}

// metricInfo describes a discovered metric with a generated query template.
type metricInfo struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Query    string `json:"query"`
}

// Handle serves GET /api/v1/discover.
func (h *Discover) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	search := strings.ToLower(r.URL.Query().Get("search"))

	slog.Debug("discover metrics", "namespace", namespace, "search", search)

	names, err := h.prom.MetricNames(r.Context(), namespace)
	if err != nil {
		slog.Warn("discover failed", "error", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]metricInfo{})
		return
	}

	var results []metricInfo
	for _, name := range names {
		if search != "" && !strings.Contains(strings.ToLower(name), search) {
			continue
		}

		cat := categorize(name)
		query := buildTemplate(name, namespace)
		results = append(results, metricInfo{
			Name:     name,
			Category: cat,
			Query:    query,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].Category != results[j].Category {
			return results[i].Category < results[j].Category
		}
		return results[i].Name < results[j].Name
	})

	// Limit to 100 results
	if len(results) > 100 {
		results = results[:100]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func categorize(name string) string {
	switch {
	case strings.HasPrefix(name, "container_cpu"):
		return "cpu"
	case strings.HasPrefix(name, "container_memory"):
		return "memory"
	case strings.HasPrefix(name, "container_network"):
		return "network"
	case strings.HasPrefix(name, "container_fs"):
		return "disk"
	case strings.HasPrefix(name, "kube_pod"):
		return "pod"
	case strings.HasPrefix(name, "kube_node"):
		return "node"
	case strings.HasPrefix(name, "kube_deployment"):
		return "deployment"
	case strings.HasPrefix(name, "kube_statefulset"):
		return "statefulset"
	case strings.HasPrefix(name, "kube_namespace"):
		return "namespace"
	default:
		return "other"
	}
}

func buildTemplate(name, namespace string) string {
	ns := namespace
	if ns == "" {
		ns = "default"
	}

	// Rate metrics (counters)
	if strings.HasSuffix(name, "_total") || strings.HasSuffix(name, "_seconds_total") {
		return "sum(rate(" + name + `{namespace="` + ns + `"}[5m]))`
	}
	// Gauge metrics
	return "sum(" + name + `{namespace="` + ns + `"})`
}
