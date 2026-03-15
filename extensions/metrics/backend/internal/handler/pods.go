package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
)

// Pods handles per-pod metric breakdown requests.
type Pods struct {
	prom *prometheus.Client
}

// NewPods creates a pods metrics handler.
func NewPods(prom *prometheus.Client) *Pods {
	return &Pods{prom: prom}
}

type podMetric struct {
	Pod     string `json:"pod"`
	CPU     string `json:"cpu"`
	Memory  string `json:"memory"`
	NetRX   string `json:"netRx"`
	NetTX   string `json:"netTx"`
	Restart string `json:"restarts"`
}

// Handle serves GET /api/v1/pod-breakdown.
func (h *Pods) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	kind := r.URL.Query().Get("kind")

	if namespace == "" || name == "" {
		http.Error(w, `{"error":"namespace and name are required"}`, http.StatusBadRequest)
		return
	}
	if kind == "" {
		kind = "Deployment"
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("pod breakdown request", "namespace", namespace, "name", name, "kind", kind, "user", username)

	podSelector := podSelectorForKind(namespace, name, kind)

	// Query per-pod CPU
	cpuQuery := fmt.Sprintf(`sum by (pod) (rate(container_cpu_usage_seconds_total{%s,container!=""}[5m])) * 1000`, podSelector)
	memQuery := fmt.Sprintf(`sum by (pod) (container_memory_working_set_bytes{%s,container!=""})`, podSelector)
	rxQuery := fmt.Sprintf(`sum by (pod) (rate(container_network_receive_bytes_total{%s}[5m]))`, podSelector)
	txQuery := fmt.Sprintf(`sum by (pod) (rate(container_network_transmit_bytes_total{%s}[5m]))`, podSelector)
	restartQuery := fmt.Sprintf(`sum by (pod) (kube_pod_container_status_restarts_total{%s})`, podSelector)

	cpuSamples, _ := h.prom.Query(r.Context(), cpuQuery)
	memSamples, _ := h.prom.Query(r.Context(), memQuery)
	rxSamples, _ := h.prom.Query(r.Context(), rxQuery)
	txSamples, _ := h.prom.Query(r.Context(), txQuery)
	restartSamples, _ := h.prom.Query(r.Context(), restartQuery)

	// Build per-pod map
	pods := make(map[string]*podMetric)

	for _, s := range cpuSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		if _, ok := pods[pod]; !ok {
			pods[pod] = &podMetric{Pod: pod, CPU: "-", Memory: "-", NetRX: "-", NetTX: "-", Restart: "0"}
		}
		pods[pod].CPU = formatValue(s.Value, "millicores")
	}
	for _, s := range memSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		if _, ok := pods[pod]; !ok {
			pods[pod] = &podMetric{Pod: pod, CPU: "-", Memory: "-", NetRX: "-", NetTX: "-", Restart: "0"}
		}
		pods[pod].Memory = formatValue(s.Value, "bytes")
	}
	for _, s := range rxSamples {
		pod := s.Metric["pod"]
		if _, ok := pods[pod]; ok {
			pods[pod].NetRX = formatValue(s.Value, "bytes/s")
		}
	}
	for _, s := range txSamples {
		pod := s.Metric["pod"]
		if _, ok := pods[pod]; ok {
			pods[pod].NetTX = formatValue(s.Value, "bytes/s")
		}
	}
	for _, s := range restartSamples {
		pod := s.Metric["pod"]
		if _, ok := pods[pod]; ok {
			pods[pod].Restart = formatValue(s.Value, "count")
		}
	}

	var result []podMetric
	for _, pm := range pods {
		result = append(result, *pm)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func podSelectorForKind(namespace, name, kind string) string {
	switch kind {
	case "Pod":
		return fmt.Sprintf(`namespace="%s",pod="%s"`, namespace, name)
	default:
		return fmt.Sprintf(`namespace="%s",pod=~"%s-.*"`, namespace, name)
	}
}
