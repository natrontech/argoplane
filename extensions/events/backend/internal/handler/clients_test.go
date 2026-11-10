package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/natrontech/argoplane/extensions/events/backend/internal/cluster"
)

// recordingClients hands out client for every destination and remembers the
// last destination it was asked for.
type recordingClients struct {
	client kubernetes.Interface
	err    error
	got    cluster.Destination
}

func (c *recordingClients) For(_ context.Context, d cluster.Destination) (kubernetes.Interface, error) {
	c.got = d
	return c.client, c.err
}

// spokeAuthorizer serves an Application that names its destination cluster, the
// case a backend reading Argocd-Target-Cluster-URL would get wrong.
func spokeAuthorizer() *Authorizer {
	app := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "argoproj.io/v1alpha1",
		"kind":       "Application",
		"metadata":   map[string]any{"name": "demo", "namespace": "argocd"},
		"spec": map[string]any{"destination": map[string]any{
			"name":      "spoke",
			"namespace": "team-a",
		}},
	}}
	return NewAuthorizer(dynamicfake.NewSimpleDynamicClient(runtime.NewScheme(), app))
}

func eventsRequest() *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/v1/events?namespace=team-a", nil)
	r.Header.Set("Argocd-Application-Name", "argocd:demo")
	// A forged header must not steer the lookup: the Application names the
	// cluster, and ArgoCD leaves this header untouched for named destinations.
	r.Header.Set("Argocd-Target-Cluster-URL", "https://other.example")
	return r
}

func TestEventsReadFromApplicationDestination(t *testing.T) {
	spoke := fake.NewClientset(&corev1.Event{
		ObjectMeta:    metav1.ObjectMeta{Name: "e1", Namespace: "team-a"},
		Type:          corev1.EventTypeWarning,
		Reason:        "BackOff",
		LastTimestamp: metav1.NewTime(time.Now()),
	})
	clients := &recordingClients{client: spoke}

	w := httptest.NewRecorder()
	NewEventsHandler(clients, spokeAuthorizer()).Handle(w, eventsRequest())

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body)
	}
	if clients.got != (cluster.Destination{Name: "spoke"}) {
		t.Errorf("resolved destination %+v, want the Application's {Name: spoke}", clients.got)
	}
	var resp EventResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(resp.Events) != 1 || resp.Events[0].Reason != "BackOff" {
		t.Errorf("expected the spoke's event, got %+v", resp.Events)
	}
}

func TestEventsUnresolvableClusterIsBadGateway(t *testing.T) {
	// Failing to reach the target cluster must be an error, never an empty
	// list that reads like "no events".
	clients := &recordingClients{err: errors.New("no registered cluster matches")}

	w := httptest.NewRecorder()
	NewEventsHandler(clients, spokeAuthorizer()).Handle(w, eventsRequest())

	if w.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadGateway)
	}
}
