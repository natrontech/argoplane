package types

import "k8s.io/apimachinery/pkg/runtime/schema"

var (
	CiliumNetPolGVR = schema.GroupVersionResource{
		Group:    "cilium.io",
		Version:  "v2",
		Resource: "ciliumnetworkpolicies",
	}
	CiliumClusterNetPolGVR = schema.GroupVersionResource{
		Group:    "cilium.io",
		Version:  "v2",
		Resource: "ciliumclusterwidenetworkpolicies",
	}
	CiliumEndpointGVR = schema.GroupVersionResource{
		Group:    "cilium.io",
		Version:  "v2",
		Resource: "ciliumendpoints",
	}
	CiliumIdentityGVR = schema.GroupVersionResource{
		Group:    "cilium.io",
		Version:  "v2",
		Resource: "ciliumidentities",
	}
)

// PolicySummary is the JSON response for a network policy.
type PolicySummary struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace,omitempty"`
	Description       string            `json:"description,omitempty"`
	EndpointSelector  map[string]string `json:"endpointSelector,omitempty"`
	HasIngress        bool              `json:"hasIngress"`
	HasEgress         bool              `json:"hasEgress"`
	IngressRuleCount  int               `json:"ingressRuleCount"`
	EgressRuleCount   int               `json:"egressRuleCount"`
	Labels            map[string]string `json:"labels,omitempty"`
	CreationTimestamp string            `json:"creationTimestamp"`
	Ownership         string            `json:"ownership"` // "app" or "platform"
	Scope             string            `json:"scope"`     // "namespace" or "clusterwide"
}

// EndpointSummary is the JSON response for a Cilium endpoint.
type EndpointSummary struct {
	Name               string            `json:"name"`
	Namespace          string            `json:"namespace"`
	EndpointID         int64             `json:"endpointId"`
	IdentityID         int64             `json:"identityId"`
	IPv4               string            `json:"ipv4,omitempty"`
	IPv6               string            `json:"ipv6,omitempty"`
	IngressEnforcement string            `json:"ingressEnforcement"`
	EgressEnforcement  string            `json:"egressEnforcement"`
	State              string            `json:"state"`
	Labels             map[string]string `json:"labels,omitempty"`
	NamedPorts         []NamedPort       `json:"namedPorts,omitempty"`
}

// NamedPort represents a named port on an endpoint.
type NamedPort struct {
	Name     string `json:"name"`
	Port     int64  `json:"port"`
	Protocol string `json:"protocol"`
}

// IdentitySummary is the JSON response for a Cilium identity.
type IdentitySummary struct {
	ID     string            `json:"id"`
	Labels map[string]string `json:"labels"`
}

// ResourceRef identifies a resource from the ArgoCD resource tree.
type ResourceRef struct {
	Group     string `json:"group"`
	Kind      string `json:"kind"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}
