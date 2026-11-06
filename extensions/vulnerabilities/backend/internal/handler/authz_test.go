package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

func TestResourceLabelSelector(t *testing.T) {
	tests := []struct {
		name      string
		resources []string
		want      string
	}{
		{
			name:      "valid names",
			resources: []string{"guestbook-ui", "redis-master"},
			want:      "trivy-operator.resource.name in (guestbook-ui,redis-master)",
		},
		{
			name:      "malicious name dropped",
			resources: []string{"x) or (1"},
			want:      matchNoReports,
		},
		{
			name:      "comma injection dropped, valid kept",
			resources: []string{"good-name", "evil,name"},
			want:      "trivy-operator.resource.name in (good-name)",
		},
		{
			name:      "empty input",
			resources: nil,
			want:      "",
		},
		{
			name:      "empty list",
			resources: []string{},
			want:      matchNoReports,
		},
		{
			name:      "only an empty name",
			resources: []string{""},
			want:      matchNoReports,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resourceLabelSelector(tt.resources)
			if got != tt.want {
				t.Errorf("resourceLabelSelector(%v) = %q, want %q", tt.resources, got, tt.want)
			}
		})
	}
}

func TestResourceLabelSelectorRejectsParens(t *testing.T) {
	got := resourceLabelSelector([]string{"x) or (1"})
	if strings.Contains(got, ")") || strings.Contains(got, "x) or") {
		t.Errorf("malicious name leaked into selector: %q", got)
	}
}

// The selector must parse the way the API server parses it and match nothing,
// with or without the label present.
func TestMatchNoReportsMatchesNothing(t *testing.T) {
	sel, err := labels.Parse(matchNoReports)
	if err != nil {
		t.Fatalf("selector does not parse: %v", err)
	}
	for _, set := range []labels.Set{nil, {"trivy-operator.resource.name": "web"}} {
		if sel.Matches(set) {
			t.Errorf("selector matched %v", set)
		}
	}
}

// reportClient is a dynamic client stub that serves one Application and applies
// label selectors to its reports with the API server's own parser.
type reportClient struct {
	dynamic.Interface
	dynamic.NamespaceableResourceInterface
	reports []unstructured.Unstructured
}

func (c reportClient) Resource(schema.GroupVersionResource) dynamic.NamespaceableResourceInterface {
	return c
}
func (c reportClient) Namespace(string) dynamic.ResourceInterface { return c }

func (c reportClient) Get(context.Context, string, metav1.GetOptions, ...string) (*unstructured.Unstructured, error) {
	return &unstructured.Unstructured{Object: map[string]any{
		"spec": map[string]any{"destination": map[string]any{"namespace": "team-a"}},
	}}, nil
}

func (c reportClient) List(_ context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error) {
	sel, err := labels.Parse(opts.LabelSelector)
	if err != nil {
		return nil, err
	}
	list := &unstructured.UnstructuredList{}
	for _, item := range c.reports {
		if sel.Matches(labels.Set(item.GetLabels())) {
			list.Items = append(list.Items, item)
		}
	}
	return list, nil
}

// Every overview endpoint must honor the filter, and an empty result must stay a
// JSON array: the UI rejects a response without one.
func TestOverviewEndpointsHonorResourceFilter(t *testing.T) {
	report := func(workload string) unstructured.Unstructured {
		item := unstructured.Unstructured{Object: map[string]any{
			"report": map[string]any{"artifact": map[string]any{"repository": workload, "tag": "1"}},
		}}
		item.SetLabels(map[string]string{"trivy-operator.resource.name": workload})
		return item
	}
	client := reportClient{reports: []unstructured.Unstructured{report("web"), report("db")}}
	auth := NewAuthorizer(client)

	endpoints := []struct {
		name   string
		field  string
		handle http.HandlerFunc
	}{
		{"overview", "images", NewOverviewHandler(Static(client), auth).Handle},
		{"audit", "reports", NewAuditHandler(Static(client), auth).HandleOverview},
		{"secrets", "reports", NewSecretsHandler(Static(client), auth).HandleOverview},
		{"sbom", "reports", NewSbomHandler(Static(client), auth).HandleOverview},
	}
	filters := []struct {
		name string
		body string
		want int
	}{
		{"no filter", `{"namespace":"team-a"}`, 2},
		{"empty list", `{"namespace":"team-a","resources":[]}`, 0},
		{"no valid name", `{"namespace":"team-a","resources":["Not Valid!"]}`, 0},
		{"one workload", `{"namespace":"team-a","resources":["web"]}`, 1},
	}

	for _, ep := range endpoints {
		for _, tc := range filters {
			t.Run(ep.name+"/"+tc.name, func(t *testing.T) {
				req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
				req.Header.Set("Argocd-Application-Name", "argocd:app-a")
				rec := httptest.NewRecorder()
				ep.handle(rec, req)

				if rec.Code != http.StatusOK {
					t.Fatalf("status %d, body %s", rec.Code, rec.Body.String())
				}
				var resp map[string]any
				if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
					t.Fatal(err)
				}
				items, ok := resp[ep.field].([]any)
				if !ok {
					t.Fatalf("%s is not an array: %s", ep.field, rec.Body.String())
				}
				if len(items) != tc.want {
					t.Errorf("got %d %s, want %d", len(items), ep.field, tc.want)
				}
			})
		}
	}
}
