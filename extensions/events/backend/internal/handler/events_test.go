package handler

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestParseSince(t *testing.T) {
	tests := []struct {
		in      string
		want    time.Duration
		wantErr bool
	}{
		{"", time.Hour, false},
		{"6h", 6 * time.Hour, false},
		{"7d", 7 * 24 * time.Hour, false},
		{"0d", 0, true},
		{"-1h", 0, true},
		{"100000000000d", 0, true}, // would overflow time.Duration
		{"garbage", 0, true},
	}
	for _, tt := range tests {
		got, err := parseSince(tt.in)
		if (err != nil) != tt.wantErr {
			t.Errorf("parseSince(%q) error = %v, wantErr %v", tt.in, err, tt.wantErr)
			continue
		}
		if !tt.wantErr && got != tt.want {
			t.Errorf("parseSince(%q) = %v, want %v", tt.in, got, tt.want)
		}
	}
}

// The summary must count all in-scope events, not just the type-filtered ones.
func TestFilterAndConvertSummaryIgnoresTypeFilter(t *testing.T) {
	now := metav1.NewTime(time.Now())
	items := []corev1.Event{
		{Type: "Warning", LastTimestamp: now},
		{Type: "Normal", LastTimestamp: now},
		{Type: "Normal", LastTimestamp: now},
	}

	got := filterAndConvert(items, "", "", "Warning", time.Now().Add(-time.Hour))

	if len(got.Events) != 1 {
		t.Errorf("expected 1 filtered event, got %d", len(got.Events))
	}
	if got.Summary.Total != 3 || got.Summary.Warnings != 1 || got.Summary.Normal != 2 {
		t.Errorf("summary should cover all in-scope events, got %+v", got.Summary)
	}
}
