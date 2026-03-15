package query

import "fmt"

// NamedQuery pairs a human-readable name with a PromQL expression.
type NamedQuery struct {
	Name  string
	Query string
	Unit  string
}

// ResourceMetrics returns PromQL queries for a workload's metrics.
// Kind must be "Deployment", "StatefulSet", or "Pod".
func ResourceMetrics(namespace, name, kind string) []NamedQuery {
	podSelector := podSelectorForKind(namespace, name, kind)

	return []NamedQuery{
		{
			Name:  "CPU Usage",
			Query: fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{%s,container!=""}[5m])) * 1000`, podSelector),
			Unit:  "millicores",
		},
		{
			Name:  "Memory Usage",
			Query: fmt.Sprintf(`sum(container_memory_working_set_bytes{%s,container!=""})`, podSelector),
			Unit:  "bytes",
		},
		{
			Name:  "Network RX",
			Query: fmt.Sprintf(`sum(rate(container_network_receive_bytes_total{%s}[5m]))`, podSelector),
			Unit:  "bytes/s",
		},
		{
			Name:  "Network TX",
			Query: fmt.Sprintf(`sum(rate(container_network_transmit_bytes_total{%s}[5m]))`, podSelector),
			Unit:  "bytes/s",
		},
		{
			Name:  "Restarts",
			Query: fmt.Sprintf(`sum(kube_pod_container_status_restarts_total{%s})`, podSelector),
			Unit:  "count",
		},
	}
}

// podSelectorForKind builds the Prometheus label selector based on resource kind.
func podSelectorForKind(namespace, name, kind string) string {
	switch kind {
	case "Pod":
		return fmt.Sprintf(`namespace="%s",pod="%s"`, namespace, name)
	default:
		// Deployments create pods like "name-<replicaset>-<hash>"
		// StatefulSets create pods like "name-0", "name-1"
		return fmt.Sprintf(`namespace="%s",pod=~"%s-.*"`, namespace, name)
	}
}
