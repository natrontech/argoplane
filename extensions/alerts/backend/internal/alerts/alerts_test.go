package alerts

import (
	"strings"
	"testing"

	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alertmanager"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/prometheus"
)

var cfg = Config{
	NamespaceLabel:  "namespace",
	SeverityLabel:   "severity",
	LinkAnnotations: []string{"runbook_url", "dashboard_url"},
}

const appFile = "team-a-app-rules-0f6c8a2e-1111-2222-3333-444455556666.yaml"

func group(file string, alerts ...prometheus.Alert) prometheus.RuleGroup {
	return prometheus.RuleGroup{
		Name: "g",
		File: "/etc/prometheus/rules/rulefiles-0/" + file,
		Rules: []prometheus.Rule{{
			Name:   "HighErrorRate",
			Query:  `rate(errors[5m]) > 1`,
			Alerts: alerts,
		}},
	}
}

func alert(state string, labels map[string]string) prometheus.Alert {
	return prometheus.Alert{State: state, Labels: labels, Annotations: map[string]string{}}
}

func appScope() Scope {
	return Scope{
		Namespaces:   map[string]struct{}{"team-a": {}},
		AppRuleFiles: map[string]struct{}{appFile: {}},
		AppWide:      true,
	}
}

func TestOwnershipComesFromTheRuleFile(t *testing.T) {
	groups := []prometheus.RuleGroup{
		group(appFile, alert("firing", map[string]string{"namespace": "team-a"})),
		group("monitoring-platform-rules-uid.yaml", alert("firing", map[string]string{"namespace": "team-a"})),
	}
	got := Select(groups, nil, appScope(), cfg)
	if len(got) != 2 {
		t.Fatalf("got %d alerts, want 2", len(got))
	}
	owners := map[string]bool{got[0].Owner: true, got[1].Owner: true}
	if !owners[OwnerApp] || !owners[OwnerPlatform] {
		t.Errorf("owners = %v, want one app and one platform", owners)
	}
}

func TestOtherNamespacesAreNeverShown(t *testing.T) {
	// Even the app's own rule must not show alerts about a namespace the
	// Application does not manage: their labels belong to another team.
	groups := []prometheus.RuleGroup{
		group(appFile, alert("firing", map[string]string{"namespace": "team-b"})),
		group("platform.yaml", alert("firing", map[string]string{"namespace": "team-b"})),
	}
	if got := Select(groups, nil, appScope(), cfg); len(got) != 0 {
		t.Errorf("got %d alerts from a foreign namespace, want 0", len(got))
	}
}

func TestAlertsWithoutNamespace(t *testing.T) {
	groups := []prometheus.RuleGroup{
		group(appFile, alert("firing", map[string]string{})),
		group("platform.yaml", alert("firing", map[string]string{"node": "n1"})),
	}

	got := Select(groups, nil, appScope(), cfg)
	if len(got) != 1 || got[0].Owner != OwnerApp {
		t.Fatalf("app-wide: got %+v, want only the app's own alert", got)
	}

	narrowed := appScope()
	narrowed.AppWide = false
	if got := Select(groups, nil, narrowed, cfg); len(got) != 0 {
		t.Errorf("namespace-scoped: got %d alerts without a namespace, want 0", len(got))
	}
}

func TestClusterFilter(t *testing.T) {
	c := cfg
	c.ClusterLabel = "cluster"
	s := appScope()
	s.Cluster = "prod"
	groups := []prometheus.RuleGroup{group("platform.yaml",
		alert("firing", map[string]string{"namespace": "team-a", "cluster": "prod"}),
		alert("firing", map[string]string{"namespace": "team-a", "cluster": "staging"}),
	)}
	if got := Select(groups, nil, s, c); len(got) != 1 || got[0].Labels["cluster"] != "prod" {
		t.Errorf("got %+v, want only the prod alert", got)
	}
}

func TestResourceFilter(t *testing.T) {
	tests := []struct {
		kind, name string
		labels     map[string]string
		want       bool
	}{
		{"Deployment", "web", map[string]string{"pod": "web-7d4b9c8f6d-x2k9p"}, true},
		{"Deployment", "web", map[string]string{"deployment": "web"}, true},
		{"Deployment", "web", map[string]string{"pod": "web-api-0"}, false},
		{"Deployment", "web", map[string]string{"pod": "web-api-7d4b9c8f6d-x2k9p"}, false},
		{"StatefulSet", "db", map[string]string{"pod": "db-0"}, true},
		{"StatefulSet", "db", map[string]string{"pod": "db-main-0"}, false},
		{"DaemonSet", "agent", map[string]string{"pod": "agent-x2k9p"}, true},
		{"Pod", "web-7d4b9c8f6d-x2k9p", map[string]string{"pod": "web-7d4b9c8f6d-x2k9p"}, true},
		{"Pod", "web", map[string]string{"pod": "web-7d4b9c8f6d-x2k9p"}, false},
		{"Service", "web", map[string]string{"pod": "web-7d4b9c8f6d-x2k9p"}, false},
	}
	for _, tt := range tests {
		labels := map[string]string{"namespace": "team-a"}
		for k, v := range tt.labels {
			labels[k] = v
		}
		s := appScope()
		s.AppWide = false
		s.Resource = &Resource{Kind: tt.kind, Name: tt.name, Namespace: "team-a"}
		got := len(Select([]prometheus.RuleGroup{group("platform.yaml", alert("firing", labels))}, nil, s, cfg)) == 1
		if got != tt.want {
			t.Errorf("%s/%s with %v: matched=%v, want %v", tt.kind, tt.name, tt.labels, got, tt.want)
		}
	}
}

func TestSuppressionMatchesDespiteExternalLabels(t *testing.T) {
	am := []alertmanager.Alert{{Labels: map[string]string{
		"alertname": "HighErrorRate", "namespace": "team-a", "cluster": "prod", "prometheus": "monitoring/k8s",
	}}}
	am[0].Status.SilencedBy = []string{"silence-1"}

	groups := []prometheus.RuleGroup{group(appFile,
		alert("firing", map[string]string{"alertname": "HighErrorRate", "namespace": "team-a"}))}
	got := Select(groups, am, appScope(), cfg)
	if len(got) != 1 || !got[0].Silenced {
		t.Fatalf("got %+v, want the alert marked silenced", got)
	}
	if s := Summarize(got); s.Firing != 0 || s.Suppressed != 1 {
		t.Errorf("summary = %+v, want the silenced alert counted only as suppressed", s)
	}
}

func TestSeverityAndSummary(t *testing.T) {
	groups := []prometheus.RuleGroup{group("platform.yaml",
		alert("firing", map[string]string{"namespace": "team-a", "severity": "page"}),
		alert("firing", map[string]string{"namespace": "team-a", "severity": "warning"}),
		alert("pending", map[string]string{"namespace": "team-a", "severity": "critical"}),
		alert("firing", map[string]string{"namespace": "team-a", "severity": "sev-x"}),
	)}
	got := Select(groups, nil, appScope(), cfg)

	if got[0].State != "firing" || got[0].Severity != SeverityCritical || got[0].SeverityRaw != "page" {
		t.Errorf("first = %+v, want the firing critical (raw page) first", got[0])
	}
	if got[len(got)-1].State != "pending" {
		t.Errorf("last = %+v, want pending after every firing alert", got[len(got)-1])
	}
	want := Summary{Firing: 3, Pending: 1, Critical: 1, Warning: 1, Unknown: 1}
	if s := Summarize(got); s != want {
		t.Errorf("summary = %+v, want %+v", s, want)
	}
}

func TestLinksDropUnsafeSchemes(t *testing.T) {
	c := cfg
	c.PrometheusExternalURL = "https://prometheus.example"
	got := links(map[string]string{
		"runbook_url":   "https://wiki.example/runbook",
		"dashboard_url": "javascript:alert(1)",
	}, `up == 0`, c)

	if len(got) != 2 {
		t.Fatalf("got %+v, want the runbook and the Prometheus link only", got)
	}
	if got[0].Label != "Runbook" || got[0].URL != "https://wiki.example/runbook" {
		t.Errorf("runbook link = %+v", got[0])
	}
	if !strings.HasPrefix(got[1].URL, "https://prometheus.example/graph?g0.expr=up+%3D%3D+0") {
		t.Errorf("prometheus link = %q", got[1].URL)
	}
}

func TestAppRulesListOnlyTheAppsOwn(t *testing.T) {
	groups := []prometheus.RuleGroup{
		group(appFile,
			alert("firing", map[string]string{"namespace": "team-a"}),
			alert("pending", map[string]string{"namespace": "team-a"}),
			alert("firing", map[string]string{"namespace": "team-b"}),
		),
		group("platform.yaml", alert("firing", map[string]string{"namespace": "team-a"})),
	}
	got := AppRules(groups, appScope(), cfg)
	if len(got) != 1 {
		t.Fatalf("got %d rules, want only the app's own", len(got))
	}
	if got[0].Firing != 1 || got[0].Pending != 1 {
		t.Errorf("counts = %d firing / %d pending, want 1/1 (team-b's alert not counted)", got[0].Firing, got[0].Pending)
	}
}
