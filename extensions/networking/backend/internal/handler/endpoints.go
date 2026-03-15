package handler

import (
	"log/slog"
	"net/http"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/networking/backend/internal/types"
)

// EndpointsHandler handles requests for Cilium endpoint data.
type EndpointsHandler struct {
	client dynamic.Interface
}

// NewEndpointsHandler creates a new EndpointsHandler.
func NewEndpointsHandler(client dynamic.Interface) *EndpointsHandler {
	return &EndpointsHandler{client: client}
}

// Handle returns CiliumEndpoints for a namespace.
func (h *EndpointsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("endpoints request", "namespace", namespace, "user", username)

	list, err := h.client.Resource(types.CiliumEndpointGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list cilium endpoints", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list endpoints")
		return
	}

	endpoints := make([]types.EndpointSummary, 0, len(list.Items))
	for _, item := range list.Items {
		endpoints = append(endpoints, parseEndpointSummary(item))
	}

	WriteJSON(w, endpoints)
}

func parseEndpointSummary(obj unstructured.Unstructured) types.EndpointSummary {
	es := types.EndpointSummary{
		Name:      obj.GetName(),
		Namespace: obj.GetNamespace(),
	}

	status, _, _ := unstructured.NestedMap(obj.Object, "status")
	if status == nil {
		return es
	}

	es.EndpointID, _, _ = unstructured.NestedInt64(status, "id")
	es.IdentityID, _, _ = unstructured.NestedInt64(status, "identity", "id")
	es.State, _, _ = unstructured.NestedString(status, "state")

	if networking, ok, _ := unstructured.NestedMap(status, "networking"); ok {
		if addrs, ok, _ := unstructured.NestedSlice(networking, "addressing"); ok {
			for _, addr := range addrs {
				if addrMap, ok := addr.(map[string]interface{}); ok {
					if v, ok := addrMap["ipv4"].(string); ok && v != "" {
						es.IPv4 = v
					}
					if v, ok := addrMap["ipv6"].(string); ok && v != "" {
						es.IPv6 = v
					}
				}
			}
		}
	}

	if policy, ok, _ := unstructured.NestedMap(status, "policy"); ok {
		es.IngressEnforcement, _, _ = unstructured.NestedString(policy, "ingress", "enforcing")
		es.EgressEnforcement, _, _ = unstructured.NestedString(policy, "egress", "enforcing")

		if es.IngressEnforcement == "" {
			if _, ok, _ := unstructured.NestedMap(policy, "ingress"); ok {
				es.IngressEnforcement = "true"
			}
		}
		if es.EgressEnforcement == "" {
			if _, ok, _ := unstructured.NestedMap(policy, "egress"); ok {
				es.EgressEnforcement = "true"
			}
		}
	}

	// Cilium stores identity labels as a []string (e.g., "k8s:app=guestbook-ui"),
	// not as a map. Parse the array into a map for frontend consumption.
	if labelSlice, ok, _ := unstructured.NestedStringSlice(status, "identity", "labels"); ok {
		es.Labels = make(map[string]string, len(labelSlice))
		for _, l := range labelSlice {
			if k, v, found := strings.Cut(l, "="); found {
				es.Labels[k] = v
			} else {
				es.Labels[l] = ""
			}
		}
	}

	if namedPorts, ok, _ := unstructured.NestedSlice(status, "named-ports"); ok {
		for _, np := range namedPorts {
			if npMap, ok := np.(map[string]interface{}); ok {
				port := types.NamedPort{}
				port.Name, _ = npMap["name"].(string)
				if p, ok := npMap["port"].(int64); ok {
					port.Port = p
				} else if p, ok := npMap["port"].(float64); ok {
					port.Port = int64(p)
				}
				port.Protocol, _ = npMap["protocol"].(string)
				es.NamedPorts = append(es.NamedPorts, port)
			}
		}
	}

	return es
}
