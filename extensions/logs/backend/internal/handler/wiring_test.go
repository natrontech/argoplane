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

	"github.com/natrontech/argoplane/extensions/logs/backend/internal/loki"
)

// lokiStub records every LogQL query and returns empty results.
type lokiStub struct {
	mu      sync.Mutex
	queries []string
}

func (s *lokiStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.queries = append(s.queries, r.URL.Query().Get("query"))
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if strings.HasSuffix(r.URL.Path, "query_range") {
		w.Write([]byte(`{"status":"success","data":{"resultType":"streams","result":[]}}`))
		return
	}
	w.Write([]byte(`{"status":"success","data":[]}`))
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
			"destination": map[string]interface{}{"server": "https://10.0.0.1:6443", "namespace": "web"},
		},
	}}, nil
}

// Every query a handler sends must carry the cluster matcher when the filter
// is on, and none when it is off. Label discovery is included so other
// clusters' label values cannot leak.
func TestClusterWiring(t *testing.T) {
	clusterMap := map[string]string{"https://10.0.0.1:6443": "prod"}
	for _, tc := range []struct {
		name  string
		label string
		want  string
	}{
		{name: "on", label: "cluster", want: `cluster="prod"`},
		{name: "off", label: "", want: ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			stub := &lokiStub{}
			srv := httptest.NewServer(stub)
			defer srv.Close()

			client := loki.NewClient(srv.URL, "")
			auth := NewAuthorizer(appClient{}, tc.label, clusterMap)
			labels := NewLabels(client, auth)
			mux := http.NewServeMux()
			mux.HandleFunc("GET /api/v1/logs", NewLogs(client, auth).Handle)
			mux.HandleFunc("GET /api/v1/logs/labels", labels.HandleLabels)
			mux.HandleFunc("GET /api/v1/logs/label/{name}/values", labels.HandleLabelValues)

			for _, path := range []string{
				"/api/v1/logs?namespace=web",
				"/api/v1/logs?namespace=web&resource=api&kind=Deployment&filter=err&severity=error",
				"/api/v1/logs?namespace=web&pod=api-0&container=app",
				"/api/v1/logs?namespace=web&pods=api-0,api-1",
				"/api/v1/logs/labels?namespace=web",
				"/api/v1/logs/labels?namespace=web&pods=api-0",
				"/api/v1/logs/label/pod/values?namespace=web",
			} {
				stub.queries = nil
				req := httptest.NewRequest(http.MethodGet, path, nil)
				req.Header.Set("Argocd-Application-Name", "argocd:demo")
				rec := httptest.NewRecorder()
				mux.ServeHTTP(rec, req)

				if rec.Code != http.StatusOK {
					t.Fatalf("%s: status %d, body %s", path, rec.Code, rec.Body.String())
				}
				if len(stub.queries) == 0 {
					t.Fatalf("%s: no queries sent", path)
				}
				for _, q := range stub.queries {
					if tc.want != "" && !strings.Contains(q, tc.want+"}") {
						t.Errorf("%s: query missing %s inside selector: %s", path, tc.want, q)
					}
					if tc.want == "" && strings.Contains(q, "cluster") {
						t.Errorf("%s: unexpected cluster matcher: %s", path, q)
					}
				}
			}
		})
	}
}
