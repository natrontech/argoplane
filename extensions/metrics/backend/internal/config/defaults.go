package config

// DefaultConfig returns the built-in dashboard configuration used when no
// custom config file is provided. It includes a unified Resource Usage view
// with pod/container view mode toggle for deployments, statefulsets, and pods.
func DefaultConfig() *DashboardConfig {
	intervals := []string{"1h", "6h", "24h", "7d"}

	// Shared rows for workloads (deployment, statefulset).
	// Queries use {{.podFilter}} for pod selection (supports filtering by specific pods).
	// Rows with GroupBy="pod" show in pod view, GroupBy="container" in container view,
	// GroupBy="" shows in both views.
	workloadRows := []*Row{
		// --- Pod view: CPU & Memory grouped by pod ---
		{
			Name:    "cpu-memory",
			Title:   "CPU & Memory",
			Tab:     "Resource Usage",
			GroupBy: "pod",
			Graphs: []*Graph{
				{
					Name:            "cpu-by-pod",
					Title:           "CPU Usage",
					Description:     "CPU usage per pod in millicores",
					GraphType:       "line",
					MetricName:      "pod",
					QueryExpression: `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="{{.namespace}}",pod=~"{{.podFilter}}",container!=""}[5m])) * 1000`,
					YAxisUnit:       "millicores",
					Thresholds: []Threshold{
						{Name: "Request", Color: "#f5a337", QueryExpression: `avg(sum by (pod) (kube_pod_container_resource_requests{namespace="{{.namespace}}",pod=~"{{.podFilter}}",resource="cpu"})) * 1000`},
						{Name: "Limit", Color: "#ef4444", QueryExpression: `avg(sum by (pod) (kube_pod_container_resource_limits{namespace="{{.namespace}}",pod=~"{{.podFilter}}",resource="cpu"})) * 1000`},
					},
				},
				{
					Name:            "memory-by-pod",
					Title:           "Memory Usage",
					Description:     "Working set memory per pod",
					GraphType:       "line",
					MetricName:      "pod",
					QueryExpression: `sum by (pod) (container_memory_working_set_bytes{namespace="{{.namespace}}",pod=~"{{.podFilter}}",container!=""})`,
					YAxisUnit:       "bytes",
					Thresholds: []Threshold{
						{Name: "Request", Color: "#f5a337", QueryExpression: `avg(sum by (pod) (kube_pod_container_resource_requests{namespace="{{.namespace}}",pod=~"{{.podFilter}}",resource="memory"}))`},
						{Name: "Limit", Color: "#ef4444", QueryExpression: `avg(sum by (pod) (kube_pod_container_resource_limits{namespace="{{.namespace}}",pod=~"{{.podFilter}}",resource="memory"}))`},
					},
				},
			},
		},
		// --- Container view: CPU & Memory grouped by container ---
		{
			Name:    "cpu-memory-container",
			Title:   "CPU & Memory",
			Tab:     "Resource Usage",
			GroupBy: "container",
			Graphs: []*Graph{
				{
					Name:            "cpu-by-container",
					Title:           "CPU per Container",
					Description:     "CPU usage broken down by container name",
					GraphType:       "line",
					MetricName:      "container",
					QueryExpression: `sum by (container) (rate(container_cpu_usage_seconds_total{namespace="{{.namespace}}",pod=~"{{.podFilter}}",container!=""}[5m])) * 1000`,
					YAxisUnit:       "millicores",
				},
				{
					Name:            "memory-by-container",
					Title:           "Memory per Container",
					Description:     "Working set memory broken down by container name",
					GraphType:       "line",
					MetricName:      "container",
					QueryExpression: `sum by (container) (container_memory_working_set_bytes{namespace="{{.namespace}}",pod=~"{{.podFilter}}",container!=""})`,
					YAxisUnit:       "bytes",
				},
			},
		},
		// --- Always visible: Network I/O (always by pod, network is pod-scoped) ---
		{
			Name:  "network",
			Title: "Network I/O",
			Tab:   "Resource Usage",
			Graphs: []*Graph{
				{
					Name:            "network-rx",
					Title:           "Network Receive",
					Description:     "Inbound network traffic per pod",
					GraphType:       "line",
					MetricName:      "pod",
					QueryExpression: `sum by (pod) (rate(container_network_receive_bytes_total{namespace="{{.namespace}}",pod=~"{{.podFilter}}"}[5m]))`,
					YAxisUnit:       "bytes/s",
				},
				{
					Name:            "network-tx",
					Title:           "Network Transmit",
					Description:     "Outbound network traffic per pod",
					GraphType:       "line",
					MetricName:      "pod",
					QueryExpression: `sum by (pod) (rate(container_network_transmit_bytes_total{namespace="{{.namespace}}",pod=~"{{.podFilter}}"}[5m]))`,
					YAxisUnit:       "bytes/s",
				},
			},
		},
		// --- Container view only: Restarts ---
		{
			Name:    "restarts",
			Title:   "Restarts",
			Tab:     "Resource Usage",
			GroupBy: "container",
			Graphs: []*Graph{
				{
					Name:            "restarts-by-container",
					Title:           "Restarts per Container",
					Description:     "Total container restart count",
					GraphType:       "line",
					MetricName:      "container",
					QueryExpression: `sum by (container) (kube_pod_container_status_restarts_total{namespace="{{.namespace}}",pod=~"{{.podFilter}}"})`,
					YAxisUnit:       "count",
				},
			},
		},
	}

	// Pod-specific rows (single pod, no filtering needed)
	podRows := []*Row{
		{
			Name:  "cpu-memory",
			Title: "CPU & Memory",
			Tab:   "Resource Usage",
			Graphs: []*Graph{
				{
					Name:            "cpu-by-container",
					Title:           "CPU Usage",
					Description:     "CPU usage per container in this pod",
					GraphType:       "line",
					MetricName:      "container",
					QueryExpression: `sum by (container) (rate(container_cpu_usage_seconds_total{namespace="{{.namespace}}",pod="{{.podFilter}}",container!=""}[5m])) * 1000`,
					YAxisUnit:       "millicores",
					Thresholds: []Threshold{
						{Name: "Request", Color: "#f5a337", QueryExpression: `sum(kube_pod_container_resource_requests{namespace="{{.namespace}}",pod="{{.podFilter}}",resource="cpu"}) * 1000`},
						{Name: "Limit", Color: "#ef4444", QueryExpression: `sum(kube_pod_container_resource_limits{namespace="{{.namespace}}",pod="{{.podFilter}}",resource="cpu"}) * 1000`},
					},
				},
				{
					Name:            "memory-by-container",
					Title:           "Memory Usage",
					Description:     "Working set memory per container in this pod",
					GraphType:       "line",
					MetricName:      "container",
					QueryExpression: `sum by (container) (container_memory_working_set_bytes{namespace="{{.namespace}}",pod="{{.podFilter}}",container!=""})`,
					YAxisUnit:       "bytes",
					Thresholds: []Threshold{
						{Name: "Request", Color: "#f5a337", QueryExpression: `sum(kube_pod_container_resource_requests{namespace="{{.namespace}}",pod="{{.podFilter}}",resource="memory"})`},
						{Name: "Limit", Color: "#ef4444", QueryExpression: `sum(kube_pod_container_resource_limits{namespace="{{.namespace}}",pod="{{.podFilter}}",resource="memory"})`},
					},
				},
			},
		},
		{
			Name:  "network",
			Title: "Network I/O",
			Tab:   "Resource Usage",
			Graphs: []*Graph{
				{
					Name:            "network-rx",
					Title:           "Network Receive",
					Description:     "Inbound network traffic",
					GraphType:       "line",
					MetricName:      "pod",
					QueryExpression: `sum(rate(container_network_receive_bytes_total{namespace="{{.namespace}}",pod="{{.podFilter}}"}[5m]))`,
					YAxisUnit:       "bytes/s",
				},
				{
					Name:            "network-tx",
					Title:           "Network Transmit",
					Description:     "Outbound network traffic",
					GraphType:       "line",
					MetricName:      "pod",
					QueryExpression: `sum(rate(container_network_transmit_bytes_total{namespace="{{.namespace}}",pod="{{.podFilter}}"}[5m]))`,
					YAxisUnit:       "bytes/s",
				},
			},
		},
	}

	return &DashboardConfig{
		Applications: []Application{
			{
				Name:    "default",
				Default: true,
				Dashboards: []*Dashboard{
					{
						GroupKind: "deployment",
						Tabs:      []string{"Resource Usage"},
						Intervals: intervals,
						Rows:      workloadRows,
					},
					{
						GroupKind: "statefulset",
						Tabs:      []string{"Resource Usage"},
						Intervals: intervals,
						Rows:      workloadRows,
					},
					{
						GroupKind: "pod",
						Tabs:      []string{"Resource Usage"},
						Intervals: intervals,
						Rows:      podRows,
					},
				},
			},
		},
	}
}
