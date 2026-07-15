package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/natrontech/argoplane/extensions/metrics/backend/internal/config"
)

// HandleGraph must reject requests that do not carry a valid ArgoCD
// application header before touching Prometheus (namespace scoping).
func TestHandleGraphRequiresAuthorization(t *testing.T) {
	h := NewDashboard(nil, config.DefaultConfig(), NewAuthorizer(nil))

	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/graph?application=default&groupKind=deployment&row=cpu-memory&graph=cpu-by-pod&namespace=kube-system&duration=1h", nil)
	rec := httptest.NewRecorder()

	h.HandleGraph(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without ArgoCD headers, got %d", rec.Code)
	}
}

func TestHandleGraphRequiresNamespace(t *testing.T) {
	h := NewDashboard(nil, config.DefaultConfig(), NewAuthorizer(nil))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/graph?application=default", nil)
	req.Header.Set("Argocd-Application-Name", "argocd:demo")
	rec := httptest.NewRecorder()

	h.HandleGraph(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without namespace, got %d", rec.Code)
	}
}
