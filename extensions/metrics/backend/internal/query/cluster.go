package query

// ClusterMetrics returns PromQL queries for cluster-wide overview metrics.
func ClusterMetrics() []NamedQuery {
	return []NamedQuery{
		{
			Name:  "Cluster CPU Usage",
			Query: `sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) * 1000`,
			Unit:  "millicores",
		},
		{
			Name:  "Cluster Memory Usage",
			Query: `sum(container_memory_working_set_bytes{container!=""})`,
			Unit:  "bytes",
		},
		{
			Name:  "Node Count",
			Query: `count(kube_node_info)`,
			Unit:  "count",
		},
		{
			Name:  "Pod Count",
			Query: `count(kube_pod_info)`,
			Unit:  "count",
		},
	}
}

// TopNamespacesQuery returns a PromQL query for top namespaces by CPU or memory.
func TopNamespacesQuery(metric string) NamedQuery {
	switch metric {
	case "memory":
		return NamedQuery{
			Name:  "Top Namespaces by Memory",
			Query: `topk(10, sum by (namespace) (container_memory_working_set_bytes{container!=""}))`,
			Unit:  "bytes",
		}
	default:
		return NamedQuery{
			Name:  "Top Namespaces by CPU",
			Query: `topk(10, sum by (namespace) (rate(container_cpu_usage_seconds_total{container!=""}[5m])) * 1000)`,
			Unit:  "millicores",
		}
	}
}
