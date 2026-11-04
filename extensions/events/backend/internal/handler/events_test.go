package handler

import (
	"context"
	"fmt"
	"strconv"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
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

// pagedEvents is a handler whose client serves items in eventListLimit pages,
// in the given order, the way the API server serves them in name order.
func pagedEvents(items []corev1.Event) *EventsHandler {
	client := fake.NewClientset()
	client.PrependReactor("list", "events", func(action k8stesting.Action) (bool, runtime.Object, error) {
		start, _ := strconv.Atoi(action.(k8stesting.ListActionImpl).ListOptions.Continue)
		end := min(start+eventListLimit, len(items))
		list := &corev1.EventList{Items: items[start:end]}
		if end < len(items) {
			list.Continue = strconv.Itoa(end)
		}
		return true, list, nil
	})
	return NewEventsHandler(client, nil)
}

// nameOrdered returns n events named in creation order, all at the same time.
func nameOrdered(n int, at time.Time) []corev1.Event {
	items := make([]corev1.Event, n)
	for i := range items {
		items[i] = corev1.Event{
			ObjectMeta:    metav1.ObjectMeta{Name: fmt.Sprintf("ev-%05d", i)},
			LastTimestamp: metav1.NewTime(at),
		}
	}
	return items
}

func hasEvent(items []corev1.Event, name string) bool {
	for i := range items {
		if items[i].Name == name {
			return true
		}
	}
	return false
}

func TestRecentEvents(t *testing.T) {
	now := time.Now()
	cutoff := now.Add(-6 * time.Hour)
	later := now.Add(time.Minute)

	t.Run("over the cap keeps the newest and says so", func(t *testing.T) {
		items := nameOrdered(5200, now)
		for i := range items {
			items[i].LastTimestamp = metav1.NewTime(now.Add(-time.Duration(5200-i) * time.Second))
		}
		got, truncated, err := pagedEvents(items).recentEvents(context.Background(), "ns", metav1.ListOptions{}, cutoff, later)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != maxEvents || !truncated {
			t.Errorf("got %d events, truncated=%v; want %d and true", len(got), truncated, maxEvents)
		}
		if !hasEvent(got, "ev-05199") || hasEvent(got, "ev-00000") {
			t.Error("kept the wrong events: want ev-05199 in, ev-00000 out")
		}
	})

	t.Run("timestamp ties are settled by name", func(t *testing.T) {
		got, _, err := pagedEvents(nameOrdered(5200, now)).recentEvents(context.Background(), "ns", metav1.ListOptions{}, cutoff, later)
		if err != nil {
			t.Fatal(err)
		}
		if !hasEvent(got, "ev-05199") || hasEvent(got, "ev-00199") {
			t.Error("kept the wrong events: want ev-05199 in, ev-00199 out")
		}
	})

	t.Run("events outside the window don't count against the cap", func(t *testing.T) {
		items := append(nameOrdered(5200, now.Add(-24*time.Hour)), nameOrdered(10, now)...)
		got, truncated, err := pagedEvents(items).recentEvents(context.Background(), "ns", metav1.ListOptions{}, cutoff, later)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 10 || truncated {
			t.Errorf("got %d events, truncated=%v; want 10 and false", len(got), truncated)
		}
	})

	t.Run("exactly the cap is complete", func(t *testing.T) {
		got, truncated, err := pagedEvents(nameOrdered(maxEvents, now)).recentEvents(context.Background(), "ns", metav1.ListOptions{}, cutoff, later)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != maxEvents || truncated {
			t.Errorf("got %d events, truncated=%v; want %d and false", len(got), truncated, maxEvents)
		}
	})

	t.Run("running out of time returns what was read and says so", func(t *testing.T) {
		got, truncated, err := pagedEvents(nameOrdered(600, now)).recentEvents(context.Background(), "ns", metav1.ListOptions{}, cutoff, now.Add(-time.Second))
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != eventListLimit || !truncated {
			t.Errorf("got %d events, truncated=%v; want %d and true", len(got), truncated, eventListLimit)
		}
	})
}
