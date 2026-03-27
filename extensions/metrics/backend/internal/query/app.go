package query

import (
	"fmt"
	"regexp"
	"strings"
)

// podFilter builds a PromQL pod selector fragment.
// If pods is non-empty, it returns `,pod=~"pod1|pod2|..."`.
// Otherwise it returns an empty string (namespace-wide).
func podFilter(pods []string) string {
	if len(pods) == 0 {
		return ""
	}
	escaped := make([]string, len(pods))
	for i, p := range pods {
		escaped[i] = regexp.QuoteMeta(p)
	}
	return fmt.Sprintf(`,pod=~"%s"`, strings.Join(escaped, "|"))
}

// AppMetrics returns PromQL queries aggregated across containers in a namespace.
// When pods is non-empty, queries are scoped to only those pods.
func AppMetrics(namespace string, pods []string) []NamedQuery {
	pf := podFilter(pods)
	return []NamedQuery{
		{
			Name:  "CPU Usage",
			Query: fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace="%s",container!=""%s}[5m])) * 1000`, namespace, pf),
			Unit:  "millicores",
		},
		{
			Name:  "Memory Usage",
			Query: fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace="%s",container!=""%s})`, namespace, pf),
			Unit:  "bytes",
		},
		{
			Name:  "Network RX",
			Query: fmt.Sprintf(`sum(rate(container_network_receive_bytes_total{namespace="%s"%s}[5m]))`, namespace, pf),
			Unit:  "bytes/s",
		},
		{
			Name:  "Network TX",
			Query: fmt.Sprintf(`sum(rate(container_network_transmit_bytes_total{namespace="%s"%s}[5m]))`, namespace, pf),
			Unit:  "bytes/s",
		},
		{
			Name:  "Pod Count",
			Query: fmt.Sprintf(`count(kube_pod_info{namespace="%s"%s})`, namespace, pf),
			Unit:  "count",
		},
		{
			Name:  "Restarts",
			Query: fmt.Sprintf(`sum(kube_pod_container_status_restarts_total{namespace="%s"%s})`, namespace, pf),
			Unit:  "count",
		},
	}
}
