package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/kelseyhightower/envconfig"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

type Config struct {
	Port     string `envconfig:"PORT" default:"8082"`
	LogLevel string `envconfig:"LOG_LEVEL" default:"info"`
}

func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	setupLogging(config.LogLevel)

	kubeConfig, err := rest.InClusterConfig()
	if err != nil {
		slog.Error("failed to create in-cluster config", "error", err)
		os.Exit(1)
	}

	dynClient, err := dynamic.NewForConfig(kubeConfig)
	if err != nil {
		slog.Error("failed to create dynamic client", "error", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/policies", handlePolicies(dynClient))
	mux.HandleFunc("GET /api/v1/endpoints", handleEndpoints(dynClient))
	mux.HandleFunc("GET /api/v1/clusterwide-policies", handleClusterwidePolicies(dynClient))
	mux.HandleFunc("GET /api/v1/identities", handleIdentities(dynClient))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", config.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	go func() {
		slog.Info("starting networking backend", "port", config.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}

func setupLogging(level string) {
	var logLevel slog.Level
	switch level {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))
}

var (
	ciliumNetPolGVR = schema.GroupVersionResource{
		Group:    "cilium.io",
		Version:  "v2",
		Resource: "ciliumnetworkpolicies",
	}
	ciliumClusterNetPolGVR = schema.GroupVersionResource{
		Group:    "cilium.io",
		Version:  "v2",
		Resource: "ciliumclusterwidenetworkpolicies",
	}
	ciliumEndpointGVR = schema.GroupVersionResource{
		Group:    "cilium.io",
		Version:  "v2",
		Resource: "ciliumendpoints",
	}
	ciliumIdentityGVR = schema.GroupVersionResource{
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

func writeJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Error("failed to encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":%q}`, msg)
}

// handlePolicies returns CiliumNetworkPolicies for a namespace.
func handlePolicies(client dynamic.Interface) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		namespace := r.URL.Query().Get("namespace")
		if namespace == "" {
			writeError(w, http.StatusBadRequest, "namespace is required")
			return
		}

		username := r.Header.Get("Argocd-Username")
		slog.Debug("policies request", "namespace", namespace, "user", username)

		list, err := client.Resource(ciliumNetPolGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
		if err != nil {
			slog.Error("failed to list cilium network policies", "error", err, "namespace", namespace)
			writeError(w, http.StatusInternalServerError, "failed to list network policies")
			return
		}

		policies := make([]PolicySummary, 0, len(list.Items))
		for _, item := range list.Items {
			policies = append(policies, parsePolicySummary(item))
		}

		writeJSON(w, policies)
	}
}

// handleClusterwidePolicies returns CiliumClusterwideNetworkPolicies.
func handleClusterwidePolicies(client dynamic.Interface) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username := r.Header.Get("Argocd-Username")
		slog.Debug("clusterwide policies request", "user", username)

		list, err := client.Resource(ciliumClusterNetPolGVR).List(r.Context(), metav1.ListOptions{})
		if err != nil {
			slog.Error("failed to list cilium clusterwide network policies", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to list clusterwide network policies")
			return
		}

		policies := make([]PolicySummary, 0, len(list.Items))
		for _, item := range list.Items {
			policies = append(policies, parsePolicySummary(item))
		}

		writeJSON(w, policies)
	}
}

// handleEndpoints returns CiliumEndpoints for a namespace.
func handleEndpoints(client dynamic.Interface) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		namespace := r.URL.Query().Get("namespace")
		if namespace == "" {
			writeError(w, http.StatusBadRequest, "namespace is required")
			return
		}

		username := r.Header.Get("Argocd-Username")
		slog.Debug("endpoints request", "namespace", namespace, "user", username)

		list, err := client.Resource(ciliumEndpointGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
		if err != nil {
			slog.Error("failed to list cilium endpoints", "error", err, "namespace", namespace)
			writeError(w, http.StatusInternalServerError, "failed to list endpoints")
			return
		}

		endpoints := make([]EndpointSummary, 0, len(list.Items))
		for _, item := range list.Items {
			endpoints = append(endpoints, parseEndpointSummary(item))
		}

		writeJSON(w, endpoints)
	}
}

// handleIdentities returns CiliumIdentities matching labels from the query.
func handleIdentities(client dynamic.Interface) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		namespace := r.URL.Query().Get("namespace")

		username := r.Header.Get("Argocd-Username")
		slog.Debug("identities request", "namespace", namespace, "user", username)

		list, err := client.Resource(ciliumIdentityGVR).List(r.Context(), metav1.ListOptions{})
		if err != nil {
			slog.Error("failed to list cilium identities", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to list identities")
			return
		}

		identities := make([]IdentitySummary, 0)
		for _, item := range list.Items {
			id := parseIdentitySummary(item)
			if namespace != "" {
				if ns, ok := id.Labels["k8s:io.kubernetes.pod.namespace"]; !ok || ns != namespace {
					continue
				}
			}
			identities = append(identities, id)
		}

		writeJSON(w, identities)
	}
}

func parsePolicySummary(obj unstructured.Unstructured) PolicySummary {
	spec, _, _ := unstructured.NestedMap(obj.Object, "spec")

	ps := PolicySummary{
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
	}

	if egress, ok, _ := unstructured.NestedSlice(spec, "egress"); ok {
		ps.HasEgress = true
		ps.EgressRuleCount = len(egress)
	}

	return ps
}

func parseEndpointSummary(obj unstructured.Unstructured) EndpointSummary {
	es := EndpointSummary{
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

	if identityLabels, ok, _ := unstructured.NestedStringMap(status, "identity", "labels"); ok {
		es.Labels = identityLabels
	}

	if namedPorts, ok, _ := unstructured.NestedSlice(status, "named-ports"); ok {
		for _, np := range namedPorts {
			if npMap, ok := np.(map[string]interface{}); ok {
				port := NamedPort{}
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

func parseIdentitySummary(obj unstructured.Unstructured) IdentitySummary {
	is := IdentitySummary{
		ID:     obj.GetName(),
		Labels: make(map[string]string),
	}

	if labels, ok, _ := unstructured.NestedStringMap(obj.Object, "security-labels"); ok {
		is.Labels = labels
	}

	return is
}

func toStringMap(m map[string]interface{}) map[string]string {
	result := make(map[string]string, len(m))
	for k, v := range m {
		result[k] = strings.TrimSpace(fmt.Sprintf("%v", v))
	}
	return result
}
