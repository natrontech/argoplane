package handler

import (
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/labels"
)

func TestResourceLabelSelector(t *testing.T) {
	tests := []struct {
		name      string
		resources []string
		want      string
	}{
		{
			name:      "valid names",
			resources: []string{"guestbook-ui", "redis-master"},
			want:      "trivy-operator.resource.name in (guestbook-ui,redis-master)",
		},
		{
			name:      "malicious name dropped",
			resources: []string{"x) or (1"},
			want:      matchNoReports,
		},
		{
			name:      "comma injection dropped, valid kept",
			resources: []string{"good-name", "evil,name"},
			want:      "trivy-operator.resource.name in (good-name)",
		},
		{
			name:      "empty input",
			resources: nil,
			want:      "",
		},
		{
			name:      "empty list",
			resources: []string{},
			want:      "",
		},
		{
			name:      "only an empty name",
			resources: []string{""},
			want:      matchNoReports,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resourceLabelSelector(tt.resources)
			if got != tt.want {
				t.Errorf("resourceLabelSelector(%v) = %q, want %q", tt.resources, got, tt.want)
			}
		})
	}
}

func TestResourceLabelSelectorRejectsParens(t *testing.T) {
	got := resourceLabelSelector([]string{"x) or (1"})
	if strings.Contains(got, ")") || strings.Contains(got, "x) or") {
		t.Errorf("malicious name leaked into selector: %q", got)
	}
}

// The selector must parse the way the API server parses it and match nothing,
// with or without the label present.
func TestMatchNoReportsMatchesNothing(t *testing.T) {
	sel, err := labels.Parse(matchNoReports)
	if err != nil {
		t.Fatalf("selector does not parse: %v", err)
	}
	for _, set := range []labels.Set{nil, {"trivy-operator.resource.name": "web"}} {
		if sel.Matches(set) {
			t.Errorf("selector matched %v", set)
		}
	}
}
