package handler

import (
	"strings"
	"testing"
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
			want:      "",
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
