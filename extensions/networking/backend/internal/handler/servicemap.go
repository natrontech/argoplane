package handler

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/networking/backend/internal/hubble"
	"github.com/natrontech/argoplane/extensions/networking/backend/internal/types"
)

// ServiceMapNode is a workload or external entity in the service map graph.
type ServiceMapNode struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	Kind      string   `json:"kind"`      // "workload", "external", "world"
	Namespace string   `json:"namespace,omitempty"`
	Pods      []string `json:"pods,omitempty"`
}

// ServiceMapEdge is an aggregated connection between two nodes.
type ServiceMapEdge struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	Target    string `json:"target"`
	Protocol  string `json:"protocol"`
	Port      uint32 `json:"port"`
	Forwarded int    `json:"forwarded"`
	Dropped   int    `json:"dropped"`
	Verdict   string `json:"verdict"` // "forwarded", "dropped", "mixed"
}

// ServiceMapResponse is the JSON response for the service map endpoint.
type ServiceMapResponse struct {
	Nodes  []ServiceMapNode `json:"nodes"`
	Edges  []ServiceMapEdge `json:"edges"`
	Hubble bool             `json:"hubble"`
}

// ServiceMapHandler handles requests for service map data.
type ServiceMapHandler struct {
	buffer *hubble.FlowBuffer
	client dynamic.Interface
}

// NewServiceMapHandler creates a new ServiceMapHandler.
func NewServiceMapHandler(buffer *hubble.FlowBuffer, client dynamic.Interface) *ServiceMapHandler {
	return &ServiceMapHandler{buffer: buffer, client: client}
}

// Handle returns a service map (aggregated workload nodes + edges) for a namespace.
func (h *ServiceMapHandler) Handle(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	if h.buffer == nil {
		WriteJSON(w, ServiceMapResponse{
			Nodes:  []ServiceMapNode{},
			Edges:  []ServiceMapEdge{},
			Hubble: false,
		})
		return
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("service map request", "namespace", namespace, "user", username)

	sinceStr := r.URL.Query().Get("since")
	since := 5 * time.Minute
	if sinceStr != "" {
		if d, err := time.ParseDuration(sinceStr); err == nil {
			since = d
		}
	}

	// Fetch all flows for the namespace (high limit — we aggregate after).
	flows, err := h.buffer.Flows(r.Context(), hubble.FlowsRequest{
		Namespace: namespace,
		Since:     since,
		Limit:     5000,
	})
	if err != nil {
		slog.Error("failed to query hubble flows for service map", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to query flows")
		return
	}

	// Filter by pod names if provided (app-scoped mode).
	if podsParam := r.URL.Query().Get("pods"); podsParam != "" {
		podSet := make(map[string]bool)
		for _, p := range strings.Split(podsParam, ",") {
			podSet[p] = true
		}
		filtered := make([]hubble.FlowSummary, 0, len(flows))
		for _, f := range flows {
			if podSet[f.SourcePod] || podSet[f.DestPod] {
				filtered = append(filtered, f)
			}
		}
		flows = filtered
	}

	// Fetch Cilium endpoints to build pod → workload name mapping.
	// Falls back to pod name prefix stripping if endpoints are unavailable.
	podToWorkload := make(map[string]string)
	endpointList, err := h.client.Resource(types.CiliumEndpointGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Warn("failed to list cilium endpoints, using pod name heuristic", "error", err, "namespace", namespace)
	} else {
		for _, item := range endpointList.Items {
			podName := item.GetName()
			workload := workloadFromEndpointLabels(item)
			if workload == "" {
				workload = podNamePrefix(podName)
			}
			podToWorkload[podName] = workload
		}
	}

	// Aggregate flows into service map nodes and edges.
	type edgeKey struct {
		src      string
		dst      string
		protocol string
		port     uint32
	}
	type edgeAgg struct {
		forwarded int
		dropped   int
	}

	nodeSet := make(map[string]ServiceMapNode)
	podsByNode := make(map[string]map[string]bool) // nodeID → set of pod names
	edgeMap := make(map[edgeKey]*edgeAgg)

	for _, f := range flows {
		srcID := resolveNodeID(f.SourcePod, f.SourceNamespace, f.SourceIP, podToWorkload)
		dstID := resolveDestNodeID(f.DestPod, f.DestNamespace, f.DestIP, f.DestDNS, podToWorkload)

		if srcID == "" || dstID == "" {
			continue
		}

		// Ensure source node exists.
		if _, ok := nodeSet[srcID]; !ok {
			nodeSet[srcID] = buildNode(srcID, f.SourcePod, f.SourceNamespace, f.SourceIP, "", podToWorkload)
			podsByNode[srcID] = make(map[string]bool)
		}
		if f.SourcePod != "" {
			podsByNode[srcID][f.SourcePod] = true
		}

		// Ensure destination node exists.
		if _, ok := nodeSet[dstID]; !ok {
			nodeSet[dstID] = buildNode(dstID, f.DestPod, f.DestNamespace, f.DestIP, f.DestDNS, podToWorkload)
			podsByNode[dstID] = make(map[string]bool)
		}
		if f.DestPod != "" {
			podsByNode[dstID][f.DestPod] = true
		}

		k := edgeKey{src: srcID, dst: dstID, protocol: f.Protocol, port: f.DestPort}
		if _, ok := edgeMap[k]; !ok {
			edgeMap[k] = &edgeAgg{}
		}
		switch f.Verdict {
		case "FORWARDED":
			edgeMap[k].forwarded++
		case "DROPPED":
			edgeMap[k].dropped++
		}
	}

	// Attach pod lists to workload nodes.
	nodes := make([]ServiceMapNode, 0, len(nodeSet))
	for id, n := range nodeSet {
		if n.Kind == "workload" {
			pods := make([]string, 0, len(podsByNode[id]))
			for p := range podsByNode[id] {
				pods = append(pods, p)
			}
			n.Pods = pods
		}
		nodes = append(nodes, n)
	}

	edges := make([]ServiceMapEdge, 0, len(edgeMap))
	for k, v := range edgeMap {
		verdict := "forwarded"
		if v.forwarded == 0 && v.dropped > 0 {
			verdict = "dropped"
		} else if v.forwarded > 0 && v.dropped > 0 {
			verdict = "mixed"
		}
		edges = append(edges, ServiceMapEdge{
			ID:        fmt.Sprintf("%s->%s:%s:%d", k.src, k.dst, k.protocol, k.port),
			Source:    k.src,
			Target:    k.dst,
			Protocol:  k.protocol,
			Port:      k.port,
			Forwarded: v.forwarded,
			Dropped:   v.dropped,
			Verdict:   verdict,
		})
	}

	WriteJSON(w, ServiceMapResponse{
		Nodes:  nodes,
		Edges:  edges,
		Hubble: true,
	})
}

// workloadFromEndpointLabels extracts the workload name from Cilium endpoint identity labels.
// Labels are stored as []string in format "k8s:app=name" or "k8s:app.kubernetes.io/name=name".
func workloadFromEndpointLabels(item unstructured.Unstructured) string {
	labelSlice, ok, _ := unstructured.NestedStringSlice(item.Object, "status", "identity", "labels")
	if !ok {
		return ""
	}
	var appName string
	for _, l := range labelSlice {
		if after, found := strings.CutPrefix(l, "k8s:app.kubernetes.io/name="); found {
			return after // highest priority
		}
		if after, found := strings.CutPrefix(l, "k8s:app="); found {
			appName = after // keep looking for app.kubernetes.io/name
		}
	}
	return appName
}

// resolveNodeID returns a stable node ID for a flow source endpoint.
func resolveNodeID(pod, ns, ip string, podToWorkload map[string]string) string {
	if pod != "" {
		workload, ok := podToWorkload[pod]
		if !ok {
			workload = podNamePrefix(pod)
		}
		if workload == "" {
			workload = pod
		}
		return ns + "/" + workload
	}
	if ip != "" {
		return "external/" + ip
	}
	return ""
}

// resolveDestNodeID returns a stable node ID for a flow destination endpoint.
func resolveDestNodeID(pod, ns, ip, dns string, podToWorkload map[string]string) string {
	if pod != "" {
		return resolveNodeID(pod, ns, ip, podToWorkload)
	}
	if dns != "" {
		return "dns/" + dns
	}
	if ip != "" {
		return "external/" + ip
	}
	return "world"
}

// buildNode creates a ServiceMapNode from flow endpoint data.
func buildNode(id, pod, ns, ip, dns string, podToWorkload map[string]string) ServiceMapNode {
	if pod != "" {
		workload, ok := podToWorkload[pod]
		if !ok {
			workload = podNamePrefix(pod)
		}
		if workload == "" {
			workload = pod
		}
		return ServiceMapNode{
			ID:        id,
			Label:     workload,
			Kind:      "workload",
			Namespace: ns,
		}
	}
	if dns != "" {
		label := dns
		// Shorten long DNS names by using only the first segment.
		if i := strings.Index(dns, ".svc."); i > 0 {
			label = dns[:i]
		}
		return ServiceMapNode{ID: id, Label: label, Kind: "external"}
	}
	if ip != "" {
		return ServiceMapNode{ID: id, Label: ip, Kind: "external"}
	}
	return ServiceMapNode{ID: "world", Label: "world", Kind: "world"}
}

// podNamePrefix strips the two trailing random suffixes from a ReplicaSet/Deployment pod name.
// e.g., "frontend-7d9f8c-xkv4p" → "frontend", "my-app-abc123" → "my-app".
func podNamePrefix(name string) string {
	parts := strings.Split(name, "-")
	if len(parts) <= 2 {
		return name
	}
	return strings.Join(parts[:len(parts)-2], "-")
}
