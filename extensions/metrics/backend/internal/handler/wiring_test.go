package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/config"
	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/prometheus"
)

// promStub records every PromQL query and returns empty results.
type promStub struct {
	mu      sync.Mutex
	queries []string
}

func (s *promStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.queries = append(s.queries, r.URL.Query().Get("query"))
	s.mu.Unlock()
	resultType := "vector"
	if strings.HasSuffix(r.URL.Path, "query_range") {
		resultType = "matrix"
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"success","data":{"resultType":"` + resultType + `","result":[]}}`))
}

// appClient is a dynamic client stub that returns one Application for any
// Get. Other methods are nil and panic if called.
type appClient struct {
	dynamic.Interface
	dynamic.NamespaceableResourceInterface
}

func (c appClient) Resource(schema.GroupVersionResource) dynamic.NamespaceableResourceInterface {
	return c
}
func (c appClient) Namespace(string) dynamic.ResourceInterface { return c }

func (c appClient) Get(context.Context, string, metav1.GetOptions, ...string) (*unstructured.Unstructured, error) {
	return &unstructured.Unstructured{Object: map[string]interface{}{
		"spec": map[string]interface{}{
			"destination": map[string]interface{}{"name": "staging", "namespace": "web"},
		},
	}}, nil
}

// Every query a handler sends must carry the cluster matcher when the filter
// is on, and none when it is off.
func TestClusterWiring(t *testing.T) {
	clusterMap := map[string]string{"staging": "stage-eu"}
	for _, tc := range []struct {
		name  string
		label string
		want  string
	}{
		{name: "on", label: "cluster", want: `cluster="stage-eu"`},
		{name: "off", label: "", want: ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			stub := &promStub{}
			srv := httptest.NewServer(stub)
			defer srv.Close()

			prom := prometheus.NewClient(srv.URL)
			auth := NewAuthorizer(appClient{}, tc.label, clusterMap)
			endpoints := []struct {
				path    string
				handler http.HandlerFunc
			}{
				{"/api/v1/app-metrics?namespace=web", NewApp(prom, auth).Handle},
				{"/api/v1/resource-metrics?namespace=web&name=api&kind=Deployment", NewResource(prom, auth).Handle},
				{"/api/v1/pod-breakdown?namespace=web&name=api&kind=Deployment", NewPods(prom, auth).Handle},
				{"/api/v1/pod-breakdown?namespace=web&pods=api-1,api-2", NewPods(prom, auth).Handle},
				{"/api/v1/per-pod-series?namespace=web&name=api&range=1h", NewPerPod(prom, auth).Handle},
				{"/api/v1/per-pod-series?namespace=web&range=1h", NewPerPod(prom, auth).Handle},
				{"/api/v1/graph?application=default&groupKind=deployment&row=cpu-memory&graph=cpu-by-pod&namespace=web&name=api&duration=1h",
					NewDashboard(prom, config.DefaultConfig(), auth).HandleGraph},
			}

			for _, ep := range endpoints {
				stub.queries = nil
				req := httptest.NewRequest(http.MethodGet, ep.path, nil)
				req.Header.Set("Argocd-Application-Name", "argocd:demo")
				rec := httptest.NewRecorder()
				ep.handler(rec, req)

				if rec.Code != http.StatusOK {
					t.Fatalf("%s: status %d, body %s", ep.path, rec.Code, rec.Body.String())
				}
				if len(stub.queries) == 0 {
					t.Fatalf("%s: no queries sent", ep.path)
				}
				for _, q := range stub.queries {
					if tc.want != "" && !strings.Contains(q, tc.want) {
						t.Errorf("%s: query missing %s: %s", ep.path, tc.want, q)
					}
					if tc.want == "" && strings.Contains(q, "cluster") {
						t.Errorf("%s: unexpected cluster matcher: %s", ep.path, q)
					}
				}
			}
		})
	}
}

// A failed Prometheus query must surface as an error, not as an empty 200 that
// looks like a workload with no data.
func TestPrometheusFailureReturnsBadGateway(t *testing.T) {
	const pods = "/api/v1/pod-breakdown?namespace=web&name=api&kind=Deployment"
	graph := "/api/v1/graph?application=default&groupKind=deployment&row=cpu-memory&graph=cpu-by-pod&namespace=web&name=api&duration=1h"

	allFail := func(*http.Request) bool { return true }
	for _, tc := range []struct {
		name string
		path string
		fail func(*http.Request) bool
	}{
		{"pods", pods, allFail},
		{"pods, one query", pods, func(r *http.Request) bool { return strings.Contains(r.URL.Query().Get("query"), "restarts") }},
		{"graph", graph, allFail},
		{"resource", "/api/v1/resource-metrics?namespace=web&name=api&kind=Deployment", allFail},
		{"resource range", "/api/v1/resource-metrics?namespace=web&name=api&kind=Deployment&range=1h", allFail},
		{"app", "/api/v1/app-metrics?namespace=web", allFail},
		{"app range only", "/api/v1/app-metrics?namespace=web&range=1h", func(r *http.Request) bool { return strings.HasSuffix(r.URL.Path, "query_range") }},
		{"per-pod", "/api/v1/per-pod-series?namespace=web&name=api&range=1h", allFail},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ok := &promStub{}
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.fail(r) {
					http.Error(w, "boom", http.StatusInternalServerError)
					return
				}
				ok.ServeHTTP(w, r)
			}))
			defer srv.Close()

			prom := prometheus.NewClient(srv.URL)
			auth := NewAuthorizer(appClient{}, "", nil)
			mux := http.NewServeMux()
			mux.HandleFunc("/api/v1/pod-breakdown", NewPods(prom, auth).Handle)
			mux.HandleFunc("/api/v1/graph", NewDashboard(prom, config.DefaultConfig(), auth).HandleGraph)
			mux.HandleFunc("/api/v1/resource-metrics", NewResource(prom, auth).Handle)
			mux.HandleFunc("/api/v1/app-metrics", NewApp(prom, auth).Handle)
			mux.HandleFunc("/api/v1/per-pod-series", NewPerPod(prom, auth).Handle)

			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.Header.Set("Argocd-Application-Name", "argocd:demo")
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadGateway {
				t.Fatalf("status %d, want 502; body %s", rec.Code, rec.Body.String())
			}
		})
	}
}
