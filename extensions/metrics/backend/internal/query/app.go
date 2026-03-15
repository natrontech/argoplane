package query

import "fmt"

// AppMetrics returns PromQL queries aggregated across all containers in a namespace.
func AppMetrics(namespace string) []NamedQuery {
	return []NamedQuery{
		{
			Name:  "CPU Usage",
			Query: fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace="%s",container!=""}[5m])) * 1000`, namespace),
			Unit:  "millicores",
		},
		{
			Name:  "Memory Usage",
			Query: fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace="%s",container!=""})`, namespace),
			Unit:  "bytes",
		},
		{
			Name:  "Network RX",
			Query: fmt.Sprintf(`sum(rate(container_network_receive_bytes_total{namespace="%s"}[5m]))`, namespace),
			Unit:  "bytes/s",
		},
		{
			Name:  "Network TX",
			Query: fmt.Sprintf(`sum(rate(container_network_transmit_bytes_total{namespace="%s"}[5m]))`, namespace),
			Unit:  "bytes/s",
		},
		{
			Name:  "Pod Count",
			Query: fmt.Sprintf(`count(kube_pod_info{namespace="%s"})`, namespace),
			Unit:  "count",
		},
		{
			Name:  "Restarts",
			Query: fmt.Sprintf(`sum(kube_pod_container_status_restarts_total{namespace="%s"})`, namespace),
			Unit:  "count",
		},
	}
}
