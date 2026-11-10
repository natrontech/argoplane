package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"

	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alertmanager"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alerts"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/prometheus"
)

const ruleUID = "0f6c8a2e-1111-2222-3333-444455556666"

// testAuthorizer serves an Application in team-a that owns the PrometheusRule
// team-a/app-rules.
func testAuthorizer() *Authorizer {
	app := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "argoproj.io/v1alpha1",
		"kind":       "Application",
		"metadata":   map[string]any{"name": "demo", "namespace": "argocd"},
		"spec":       map[string]any{"destination": map[string]any{"namespace": "team-a"}},
		"status": map[string]any{"resources": []any{
			map[string]any{"group": "monitoring.coreos.com", "kind": "PrometheusRule", "namespace": "team-a", "name": "app-rules"},
		}},
	}}
	rule := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "monitoring.coreos.com/v1",
		"kind":       "PrometheusRule",
		"metadata":   map[string]any{"name": "app-rules", "namespace": "team-a", "uid": ruleUID},
	}}
	listKinds := map[schema.GroupVersionResource]string{
		applicationGVR:    "ApplicationList",
		prometheusRuleGVR: "PrometheusRuleList",
	}
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), listKinds, app, rule)
	return NewAuthorizer(client, "", nil)
}

type fakeRules struct {
	groups []prometheus.RuleGroup
	err    error
}

func (f fakeRules) AlertingRules(context.Context) ([]prometheus.RuleGroup, error) {
	return f.groups, f.err
}

type fakeSilences struct{ err error }

func (f fakeSilences) Alerts(context.Context) ([]alertmanager.Alert, error) { return nil, f.err }

func appGroup() prometheus.RuleGroup {
	return prometheus.RuleGroup{
		Name: "app",
		File: "/etc/prometheus/rules/prometheus-rulefiles-0/team-a-app-rules-" + ruleUID + ".yaml",
		Rules: []prometheus.Rule{{
			Name:   "AppDown",
			Alerts: []prometheus.Alert{{State: "firing", Labels: map[string]string{"namespace": "team-a"}}},
		}},
	}
}

var testCfg = alerts.Config{NamespaceLabel: "namespace", SeverityLabel: "severity"}

func get(h http.HandlerFunc, url string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, url, nil)
	r.Header.Set("Argocd-Application-Name", "argocd:demo")
	w := httptest.NewRecorder()
	h(w, r)
	return w
}

func TestRuleFileComesFromThePrometheusRuleUID(t *testing.T) {
	_, err := testAuthorizer().Scope(context.Background(), httptest.NewRequest(http.MethodGet, "/", nil), "", nil)
	if err == nil {
		t.Fatal("expected a request without ArgoCD headers to be rejected")
	}

	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Header.Set("Argocd-Application-Name", "argocd:demo")
	s, err := testAuthorizer().Scope(context.Background(), r, "", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "team-a-app-rules-" + ruleUID + ".yaml"
	if _, ok := s.AppRuleFiles[want]; !ok {
		t.Errorf("rule files = %v, want %s", s.AppRuleFiles, want)
	}
	if !s.AppWide {
		t.Error("a request without a namespace should be app-wide")
	}
}

func TestAlertsReportsAppOwnership(t *testing.T) {
	h := New(fakeRules{groups: []prometheus.RuleGroup{appGroup()}}, nil, testAuthorizer(), testCfg)
	w := get(h.Alerts, "/api/v1/alerts")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body)
	}
	var resp AlertsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Alerts) != 1 || resp.Alerts[0].Owner != alerts.OwnerApp {
		t.Errorf("alerts = %+v, want one app-owned alert", resp.Alerts)
	}
	if resp.Summary.Firing != 1 {
		t.Errorf("summary = %+v, want 1 firing", resp.Summary)
	}
}

func TestForeignNamespaceIsForbidden(t *testing.T) {
	h := New(fakeRules{}, nil, testAuthorizer(), testCfg)
	if w := get(h.Alerts, "/api/v1/alerts?namespace=team-b"); w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", w.Code)
	}
}

func TestBadParametersAreRejected(t *testing.T) {
	h := New(fakeRules{}, nil, testAuthorizer(), testCfg)
	for _, url := range []string{
		"/api/v1/alerts?namespace=Team_A",
		"/api/v1/alerts?namespace=team-a&kind=Deployment",
		"/api/v1/alerts?kind=Deployment&name=web",
	} {
		if w := get(h.Alerts, url); w.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", url, w.Code)
		}
	}
}

func TestRulesAPIFailureIsBadGateway(t *testing.T) {
	// An unreachable Prometheus must never look like "no alerts".
	h := New(fakeRules{err: errors.New("connection refused")}, nil, testAuthorizer(), testCfg)
	if w := get(h.Alerts, "/api/v1/alerts"); w.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", w.Code)
	}
}

func TestAlertmanagerFailureIsAWarning(t *testing.T) {
	h := New(fakeRules{groups: []prometheus.RuleGroup{appGroup()}}, fakeSilences{err: errors.New("timeout")}, testAuthorizer(), testCfg)
	w := get(h.Alerts, "/api/v1/alerts")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var resp AlertsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Alerts) != 1 || len(resp.Warnings) != 1 {
		t.Errorf("got %d alerts and warnings %v, want the alert plus one warning", len(resp.Alerts), resp.Warnings)
	}
}

func TestRulesListsTheAppsOwn(t *testing.T) {
	platform := prometheus.RuleGroup{Name: "platform", File: "monitoring-platform-x.yaml",
		Rules: []prometheus.Rule{{Name: "NodeDown"}}}
	h := New(fakeRules{groups: []prometheus.RuleGroup{appGroup(), platform}}, nil, testAuthorizer(), testCfg)
	w := get(h.Rules, "/api/v1/rules")
	var resp RulesResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Rules) != 1 || resp.Rules[0].Name != "AppDown" || resp.Rules[0].Firing != 1 {
		t.Errorf("rules = %+v, want only AppDown with one firing alert", resp.Rules)
	}
}
