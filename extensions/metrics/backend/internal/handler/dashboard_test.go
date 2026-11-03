package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/config"
)

// HandleGraph must reject requests that do not carry a valid ArgoCD
// application header before touching Prometheus (namespace scoping).
func TestHandleGraphRequiresAuthorization(t *testing.T) {
	h := NewDashboard(nil, config.DefaultConfig(), NewAuthorizer(nil, "", nil))

	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/graph?application=default&groupKind=deployment&row=cpu-memory&graph=cpu-by-pod&namespace=kube-system&duration=1h", nil)
	rec := httptest.NewRecorder()

	h.HandleGraph(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without ArgoCD headers, got %d", rec.Code)
	}
}

func TestHandleGraphRequiresNamespace(t *testing.T) {
	h := NewDashboard(nil, config.DefaultConfig(), NewAuthorizer(nil, "", nil))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/graph?application=default", nil)
	req.Header.Set("Argocd-Application-Name", "argocd:demo")
	rec := httptest.NewRecorder()

	h.HandleGraph(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without namespace, got %d", rec.Code)
	}
}

// Built-in dashboard queries must render unchanged with the cluster filter off,
// and carry the matcher on every query with it on.
func TestDefaultsCluster(t *testing.T) {
	// Dashboards share rows, so dedupe to the 19 distinct queries in defaults.go.
	seen := map[string]bool{}
	var exprs []string
	add := func(e string) {
		if e != "" && !seen[e] {
			seen[e] = true
			exprs = append(exprs, e)
		}
	}
	for _, app := range config.DefaultConfig().Applications {
		for _, d := range app.Dashboards {
			for _, row := range d.Rows {
				for _, g := range row.Graphs {
					add(g.QueryExpression)
					for _, th := range g.Thresholds {
						add(th.QueryExpression)
					}
				}
			}
		}
	}
	if len(exprs) != 19 {
		t.Fatalf("expected 19 default queries, got %d", len(exprs))
	}

	base := map[string]string{"namespace": "web", "name": "api", "podFilter": "api"}
	with := func(cluster, matcher string) map[string]string {
		vars := map[string]string{"cluster": cluster, "clusterMatcher": matcher}
		for k, v := range base {
			vars[k] = v
		}
		return vars
	}

	for _, expr := range exprs {
		want, err := renderTemplate(strings.ReplaceAll(expr, "{{.clusterMatcher}}", ""), base)
		if err != nil {
			t.Fatal(err)
		}
		off, err := renderTemplate(expr, with("", ""))
		if err != nil {
			t.Fatal(err)
		}
		if off != want {
			t.Errorf("filter off changed query:\n got  %s\n want %s", off, want)
		}
		on, err := renderTemplate(expr, with("prod", `,cluster="prod"`))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(on, `namespace="web",cluster="prod"`) {
			t.Errorf("filter on missing matcher: %s", on)
		}
	}
}
