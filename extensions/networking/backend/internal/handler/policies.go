package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/networking/backend/internal/types"
)

// PoliciesHandler handles requests for Cilium network policy data.
type PoliciesHandler struct {
	client dynamic.Interface
}

// NewPoliciesHandler creates a new PoliciesHandler.
func NewPoliciesHandler(client dynamic.Interface) *PoliciesHandler {
	return &PoliciesHandler{client: client}
}

// policiesWithOwnershipRequest is the JSON body for the ownership-aware endpoint.
type policiesWithOwnershipRequest struct {
	Namespace string           `json:"namespace"`
	Resources []types.ResourceRef `json:"resources"`
}

// HandleWithOwnership returns all policies (namespace + clusterwide) with ownership tags.
func (h *PoliciesHandler) HandleWithOwnership(w http.ResponseWriter, r *http.Request) {
	var req policiesWithOwnershipRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	defer r.Body.Close()

	if req.Namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("policies-with-ownership request", "namespace", req.Namespace, "user", username, "resources", len(req.Resources))

	// Build a lookup set from the app's resource tree.
	appResources := make(map[string]bool, len(req.Resources))
	for _, ref := range req.Resources {
		key := resourceKey(ref.Kind, ref.Namespace, ref.Name)
		appResources[key] = true
	}

	var policies []types.PolicySummary

	// Namespace-scoped policies.
	nsList, err := h.client.Resource(types.CiliumNetPolGVR).Namespace(req.Namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list cilium network policies", "error", err, "namespace", req.Namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list network policies")
		return
	}

	for _, item := range nsList.Items {
		ps := ParsePolicySummary(item)
		ps.Scope = "namespace"
		key := resourceKey("CiliumNetworkPolicy", ps.Namespace, ps.Name)
		if appResources[key] {
			ps.Ownership = "app"
		} else {
			ps.Ownership = "platform"
		}
		policies = append(policies, ps)
	}

	// Clusterwide policies.
	cwList, err := h.client.Resource(types.CiliumClusterNetPolGVR).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list cilium clusterwide network policies", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list clusterwide network policies")
		return
	}

	for _, item := range cwList.Items {
		ps := ParsePolicySummary(item)
		ps.Scope = "clusterwide"
		key := resourceKey("CiliumClusterwideNetworkPolicy", "", ps.Name)
		if appResources[key] {
			ps.Ownership = "app"
		} else {
			ps.Ownership = "platform"
		}
		policies = append(policies, ps)
	}

	if policies == nil {
		policies = []types.PolicySummary{}
	}

	WriteJSON(w, policies)
}

// HandleNamespaced returns CiliumNetworkPolicies for a namespace (legacy GET endpoint).
func (h *PoliciesHandler) HandleNamespaced(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("policies request", "namespace", namespace, "user", username)

	list, err := h.client.Resource(types.CiliumNetPolGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list cilium network policies", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list network policies")
		return
	}

	policies := make([]types.PolicySummary, 0, len(list.Items))
	for _, item := range list.Items {
		ps := ParsePolicySummary(item)
		ps.Scope = "namespace"
		policies = append(policies, ps)
	}

	WriteJSON(w, policies)
}

// HandleClusterwide returns CiliumClusterwideNetworkPolicies (legacy GET endpoint).
func (h *PoliciesHandler) HandleClusterwide(w http.ResponseWriter, r *http.Request) {
	username := r.Header.Get("Argocd-Username")
	slog.Debug("clusterwide policies request", "user", username)

	list, err := h.client.Resource(types.CiliumClusterNetPolGVR).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list cilium clusterwide network policies", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list clusterwide network policies")
		return
	}

	policies := make([]types.PolicySummary, 0, len(list.Items))
	for _, item := range list.Items {
		ps := ParsePolicySummary(item)
		ps.Scope = "clusterwide"
		policies = append(policies, ps)
	}

	WriteJSON(w, policies)
}

// ParsePolicySummary extracts a PolicySummary from an unstructured Cilium policy.
func ParsePolicySummary(obj unstructured.Unstructured) types.PolicySummary {
	spec, _, _ := unstructured.NestedMap(obj.Object, "spec")

	ps := types.PolicySummary{
		Name:              obj.GetName(),
		Namespace:         obj.GetNamespace(),
		Labels:            obj.GetLabels(),
		CreationTimestamp: obj.GetCreationTimestamp().Format(time.RFC3339),
	}

	if desc, ok := obj.GetAnnotations()["description"]; ok {
		ps.Description = desc
	}

	if sel, ok, _ := unstructured.NestedMap(spec, "endpointSelector", "matchLabels"); ok {
		ps.EndpointSelector = toStringMap(sel)
	}

	if ingress, ok, _ := unstructured.NestedSlice(spec, "ingress"); ok {
		ps.HasIngress = true
		ps.IngressRuleCount = len(ingress)
		ps.IngressRules = parseRules(ingress, "from")
	}

	if egress, ok, _ := unstructured.NestedSlice(spec, "egress"); ok {
		ps.HasEgress = true
		ps.EgressRuleCount = len(egress)
		ps.EgressRules = parseRules(egress, "to")
	}

	return ps
}

// parseRules extracts PolicyRule slices from unstructured ingress or egress rule lists.
// direction is "from" for ingress rules and "to" for egress rules.
func parseRules(rules []interface{}, direction string) []types.PolicyRule {
	result := make([]types.PolicyRule, 0, len(rules))
	for _, raw := range rules {
		ruleMap, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}

		peers := parsePeers(ruleMap, direction)
		if len(peers) == 0 {
			peers = []string{"any"}
		}

		ports := parsePorts(ruleMap)
		if len(ports) == 0 {
			ports = []string{"any"}
		}

		result = append(result, types.PolicyRule{
			Peers: peers,
			Ports: ports,
		})
	}
	return result
}

// parsePeers extracts peer descriptions from a rule map.
func parsePeers(ruleMap map[string]interface{}, direction string) []string {
	var peers []string

	// Endpoints: fromEndpoints / toEndpoints
	endpointsKey := direction + "Endpoints"
	if eps, ok := ruleMap[endpointsKey].([]interface{}); ok {
		for _, ep := range eps {
			epMap, ok := ep.(map[string]interface{})
			if !ok {
				continue
			}
			if ml, ok := epMap["matchLabels"].(map[string]interface{}); ok {
				var labels []string
				for k, v := range ml {
					labels = append(labels, fmt.Sprintf("%s=%v", k, v))
				}
				if len(labels) > 0 {
					peers = append(peers, strings.Join(labels, ", "))
				}
			}
		}
	}

	// CIDR: fromCIDR / toCIDR
	cidrKey := direction + "CIDR"
	if cidrs, ok := ruleMap[cidrKey].([]interface{}); ok {
		for _, c := range cidrs {
			if s, ok := c.(string); ok {
				peers = append(peers, s)
			}
		}
	}

	// Entities: fromEntities / toEntities
	entitiesKey := direction + "Entities"
	if entities, ok := ruleMap[entitiesKey].([]interface{}); ok {
		for _, e := range entities {
			if s, ok := e.(string); ok {
				peers = append(peers, s)
			}
		}
	}

	// FQDNs: toFQDNs (egress only, but parse defensively)
	if fqdns, ok := ruleMap["toFQDNs"].([]interface{}); ok {
		for _, f := range fqdns {
			fMap, ok := f.(map[string]interface{})
			if !ok {
				continue
			}
			if name, ok := fMap["matchName"].(string); ok && name != "" {
				peers = append(peers, name)
			} else if pattern, ok := fMap["matchPattern"].(string); ok && pattern != "" {
				peers = append(peers, pattern)
			}
		}
	}

	return peers
}

// parsePorts extracts port descriptions from a rule map's toPorts field.
func parsePorts(ruleMap map[string]interface{}) []string {
	var ports []string

	toPorts, ok := ruleMap["toPorts"].([]interface{})
	if !ok {
		return nil
	}

	for _, tp := range toPorts {
		tpMap, ok := tp.(map[string]interface{})
		if !ok {
			continue
		}
		portList, ok := tpMap["ports"].([]interface{})
		if !ok {
			continue
		}
		for _, p := range portList {
			pMap, ok := p.(map[string]interface{})
			if !ok {
				continue
			}
			port, _ := pMap["port"].(string)
			protocol, _ := pMap["protocol"].(string)
			if protocol == "" {
				protocol = "TCP"
			}
			if port != "" {
				ports = append(ports, protocol+":"+port)
			}
		}
	}

	return ports
}

func resourceKey(kind, namespace, name string) string {
	return kind + "/" + namespace + "/" + name
}

func toStringMap(m map[string]interface{}) map[string]string {
	result := make(map[string]string, len(m))
	for k, v := range m {
		result[k] = strings.TrimSpace(fmt.Sprintf("%v", v))
	}
	return result
}
