package handler

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func ccnp(spec map[string]interface{}) unstructured.Unstructured {
	return unstructured.Unstructured{Object: map[string]interface{}{"spec": spec}}
}

func TestSelectsNamespace(t *testing.T) {
	nsExpr := func(op string, values ...interface{}) map[string]interface{} {
		return map[string]interface{}{"endpointSelector": map[string]interface{}{
			"matchExpressions": []interface{}{map[string]interface{}{
				"key": "k8s:io.kubernetes.pod.namespace", "operator": op, "values": values,
			}},
		}}
	}
	for _, tc := range []struct {
		name string
		obj  unstructured.Unstructured
		want bool
	}{
		{"empty selector applies everywhere", ccnp(map[string]interface{}{"endpointSelector": map[string]interface{}{}}), true},
		{"pod labels only", ccnp(map[string]interface{}{"endpointSelector": map[string]interface{}{
			"matchLabels": map[string]interface{}{"app": "web"}}}), true},
		{"pinned to this namespace", ccnp(map[string]interface{}{"endpointSelector": map[string]interface{}{
			"matchLabels": map[string]interface{}{"io.kubernetes.pod.namespace": "shop"}}}), true},
		{"pinned to another namespace", ccnp(map[string]interface{}{"endpointSelector": map[string]interface{}{
			"matchLabels": map[string]interface{}{"k8s:io.kubernetes.pod.namespace": "other-team"}}}), false},
		{"In list with this namespace", ccnp(nsExpr("In", "shop", "cart")), true},
		{"In list without it", ccnp(nsExpr("In", "cart")), false},
		{"NotIn this namespace", ccnp(nsExpr("NotIn", "shop")), false},
		{"NotIn others", ccnp(nsExpr("NotIn", "kube-system")), true},
		{"host policy", ccnp(map[string]interface{}{"nodeSelector": map[string]interface{}{}}), false},
		{"specs list, one matching", unstructured.Unstructured{Object: map[string]interface{}{"specs": []interface{}{
			map[string]interface{}{"endpointSelector": map[string]interface{}{
				"matchLabels": map[string]interface{}{"io.kubernetes.pod.namespace": "other-team"}}},
			map[string]interface{}{"endpointSelector": map[string]interface{}{}},
		}}}, true},
	} {
		if got := selectsNamespace(tc.obj, "shop"); got != tc.want {
			t.Errorf("%s: selectsNamespace = %v, want %v", tc.name, got, tc.want)
		}
	}
}
