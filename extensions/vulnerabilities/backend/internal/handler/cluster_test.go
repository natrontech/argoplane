package handler

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestServesCluster(t *testing.T) {
	app := &unstructured.Unstructured{Object: map[string]any{
		"spec": map[string]any{"destination": map[string]any{
			"name": "prod", "server": "https://prod.example:6443", "namespace": "shop",
		}},
	}}
	for _, tc := range []struct {
		name string
		opts []AuthorizerOption
		want bool
	}{
		{"check off by default", nil, true},
		{"matching name", []AuthorizerOption{WithCluster("prod", "")}, true},
		{"matching server, trailing slash", []AuthorizerOption{WithCluster("", "https://prod.example:6443/")}, true},
		{"other cluster", []AuthorizerOption{WithCluster("staging", "https://staging.example:6443")}, false},
	} {
		if got := NewAuthorizer(nil, tc.opts...).servesCluster(app); got != tc.want {
			t.Errorf("%s: servesCluster = %v, want %v", tc.name, got, tc.want)
		}
	}
}
