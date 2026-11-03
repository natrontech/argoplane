package query

import (
	"strings"
	"testing"
)

func TestClusterMatcher(t *testing.T) {
	tests := []struct {
		name, label, cluster, want string
	}{
		{name: "off", label: "", cluster: "prod", want: ""},
		{name: "unresolved", label: "cluster", cluster: "", want: ""},
		{name: "on", label: "cluster", cluster: "prod", want: `,cluster="prod"`},
		{name: "injection escaped", label: "cluster", cluster: `x"} or vector(1) #\`, want: `,cluster="x\"} or vector(1) #\\"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ClusterMatcher(tt.label, tt.cluster); got != tt.want {
				t.Errorf("ClusterMatcher(%q, %q) = %q, want %q", tt.label, tt.cluster, got, tt.want)
			}
		})
	}
}

// Queries with the filter off must stay byte-identical to the pre-filter output.
func TestAppMetricsClusterOff(t *testing.T) {
	want := []string{
		`sum(rate(container_cpu_usage_seconds_total{namespace="ns",container!="",pod=~"a"}[5m])) * 1000`,
		`sum(container_memory_working_set_bytes{namespace="ns",container!="",pod=~"a"})`,
		`sum(rate(container_network_receive_bytes_total{namespace="ns",pod=~"a"}[5m]))`,
		`sum(rate(container_network_transmit_bytes_total{namespace="ns",pod=~"a"}[5m]))`,
		`count(kube_pod_info{namespace="ns",pod=~"a"})`,
		`sum(kube_pod_container_status_restarts_total{namespace="ns",pod=~"a"})`,
	}
	for _, off := range [][2]string{{"", ""}, {"cluster", ""}, {"", "prod"}} {
		got := AppMetrics("ns", []string{"a"}, off[0], off[1])
		if len(got) != len(want) {
			t.Fatalf("got %d queries, want %d", len(got), len(want))
		}
		for i, q := range got {
			if q.Query != want[i] {
				t.Errorf("AppMetrics(off %v)[%d] = %q, want %q", off, i, q.Query, want[i])
			}
		}
	}
}

func TestAppMetricsClusterOn(t *testing.T) {
	for _, q := range AppMetrics("ns", nil, "cluster", "prod") {
		if !strings.Contains(q.Query, `,cluster="prod"}`) {
			t.Errorf("%s: missing cluster matcher in %q", q.Name, q.Query)
		}
	}
}

func TestResourceMetricsClusterOff(t *testing.T) {
	got := ResourceMetrics("ns", "web", "Pod", "", "")
	want := `sum(rate(container_cpu_usage_seconds_total{namespace="ns",pod="web",container!=""}[5m])) * 1000`
	if got[0].Query != want {
		t.Errorf("ResourceMetrics(off)[0] = %q, want %q", got[0].Query, want)
	}
	for _, q := range got {
		if strings.Contains(q.Query, "cluster") {
			t.Errorf("%s: unexpected cluster matcher in %q", q.Name, q.Query)
		}
	}
}

func TestResourceMetricsClusterOn(t *testing.T) {
	for _, kind := range []string{"Pod", "Deployment"} {
		for _, q := range ResourceMetrics("ns", "web", kind, "cluster", "prod") {
			if !strings.Contains(q.Query, `,cluster="prod"`) {
				t.Errorf("%s %s: missing cluster matcher in %q", kind, q.Name, q.Query)
			}
		}
	}
}
