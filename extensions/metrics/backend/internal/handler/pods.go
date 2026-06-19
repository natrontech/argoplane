package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/query"
)

// Pods handles per-pod metric breakdown requests.
type Pods struct {
	prom *prometheus.Client
	auth *Authorizer
}

// NewPods creates a pods metrics handler.
func NewPods(prom *prometheus.Client, auth *Authorizer) *Pods {
	return &Pods{prom: prom, auth: auth}
}

type podMetric struct {
	Pod           string `json:"pod"`
	CPU           string `json:"cpu"`
	CPURequest    string `json:"cpuRequest"`
	CPULimit      string `json:"cpuLimit"`
	Memory        string `json:"memory"`
	MemoryRequest string `json:"memoryRequest"`
	MemoryLimit   string `json:"memoryLimit"`
	NetRX         string `json:"netRx"`
	NetTX         string `json:"netTx"`
	Restart       string `json:"restarts"`
}

// Handle serves GET /api/v1/pod-breakdown.
func (h *Pods) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	kind := r.URL.Query().Get("kind")
	podsParam := r.URL.Query().Get("pods")

	if namespace == "" {
		http.Error(w, `{"error":"namespace is required"}`, http.StatusBadRequest)
		return
	}
	if name == "" && podsParam == "" {
		http.Error(w, `{"error":"name or pods parameter is required"}`, http.StatusBadRequest)
		return
	}
	if kind == "" {
		kind = "Deployment"
	}

	if !h.auth.AuthorizeNamespace(w, r, namespace) {
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("pod breakdown request", "namespace", namespace, "name", name, "kind", kind, "pods", podsParam, "user", username)

	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()

	var podSelector string
	if podsParam != "" {
		pods := strings.Split(podsParam, ",")
		podSelector = fmt.Sprintf(`namespace="%s",pod=~"%s"`, query.EscapePromQLLabel(namespace), quoteRegexAlternation(pods))
	} else {
		podSelector = podSelectorForKind(namespace, name, kind)
	}

	// Query per-pod CPU
	cpuQuery := fmt.Sprintf(`sum by (pod) (rate(container_cpu_usage_seconds_total{%s,container!=""}[5m])) * 1000`, podSelector)
	cpuReqQuery := fmt.Sprintf(`sum by (pod) (kube_pod_container_resource_requests{%s,resource="cpu"}) * 1000`, podSelector)
	cpuLimQuery := fmt.Sprintf(`sum by (pod) (kube_pod_container_resource_limits{%s,resource="cpu"}) * 1000`, podSelector)
	memQuery := fmt.Sprintf(`sum by (pod) (container_memory_working_set_bytes{%s,container!=""})`, podSelector)
	memReqQuery := fmt.Sprintf(`sum by (pod) (kube_pod_container_resource_requests{%s,resource="memory"})`, podSelector)
	memLimQuery := fmt.Sprintf(`sum by (pod) (kube_pod_container_resource_limits{%s,resource="memory"})`, podSelector)
	rxQuery := fmt.Sprintf(`sum by (pod) (rate(container_network_receive_bytes_total{%s}[5m]))`, podSelector)
	txQuery := fmt.Sprintf(`sum by (pod) (rate(container_network_transmit_bytes_total{%s}[5m]))`, podSelector)
	restartQuery := fmt.Sprintf(`sum by (pod) (kube_pod_container_status_restarts_total{%s})`, podSelector)

	// queryOrLog runs an instant query and logs (rather than swallows) any error,
	// returning partial results so a single failed query doesn't drop the whole table.
	queryOrLog := func(name, q string) []prometheus.Sample {
		samples, err := h.prom.Query(ctx, q)
		if err != nil {
			slog.Warn("pod breakdown query failed", "metric", name, "error", err)
		}
		return samples
	}

	cpuSamples := queryOrLog("cpu", cpuQuery)
	cpuReqSamples := queryOrLog("cpuRequest", cpuReqQuery)
	cpuLimSamples := queryOrLog("cpuLimit", cpuLimQuery)
	memSamples := queryOrLog("memory", memQuery)
	memReqSamples := queryOrLog("memoryRequest", memReqQuery)
	memLimSamples := queryOrLog("memoryLimit", memLimQuery)
	rxSamples := queryOrLog("netRx", rxQuery)
	txSamples := queryOrLog("netTx", txQuery)
	restartSamples := queryOrLog("restarts", restartQuery)

	// Build per-pod map
	pods := make(map[string]*podMetric)

	ensurePod := func(pod string) {
		if _, ok := pods[pod]; !ok {
			pods[pod] = &podMetric{
				Pod: pod, CPU: "-", CPURequest: "-", CPULimit: "-",
				Memory: "-", MemoryRequest: "-", MemoryLimit: "-",
				NetRX: "-", NetTX: "-", Restart: "0",
			}
		}
	}

	for _, s := range cpuSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		ensurePod(pod)
		pods[pod].CPU = formatValue(s.Value, "millicores")
	}
	for _, s := range cpuReqSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		ensurePod(pod)
		pods[pod].CPURequest = formatValue(s.Value, "millicores")
	}
	for _, s := range cpuLimSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		ensurePod(pod)
		pods[pod].CPULimit = formatValue(s.Value, "millicores")
	}
	for _, s := range memSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		ensurePod(pod)
		pods[pod].Memory = formatValue(s.Value, "bytes")
	}
	for _, s := range memReqSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		ensurePod(pod)
		pods[pod].MemoryRequest = formatValue(s.Value, "bytes")
	}
	for _, s := range memLimSamples {
		pod := s.Metric["pod"]
		if pod == "" {
			continue
		}
		ensurePod(pod)
		pods[pod].MemoryLimit = formatValue(s.Value, "bytes")
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
	ns := query.EscapePromQLLabel(namespace)
	switch kind {
	case "Pod":
		return fmt.Sprintf(`namespace="%s",pod="%s"`, ns, query.EscapePromQLLabel(name))
	default:
		return fmt.Sprintf(`namespace="%s",pod=~"%s-.*"`, ns, regexp.QuoteMeta(name))
	}
}

// quoteRegexAlternation builds a safe regex alternation (a|b|c) from a list of
// user-supplied pod names, quoting each so they cannot inject regex or break out
// of the matcher.
func quoteRegexAlternation(values []string) string {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = regexp.QuoteMeta(v)
	}
	return strings.Join(quoted, "|")
}
