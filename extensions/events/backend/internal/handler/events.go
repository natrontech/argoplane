package handler

import (
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// EventsHandler handles Kubernetes event queries.
type EventsHandler struct {
	client kubernetes.Interface
}

// NewEventsHandler creates a new events handler.
func NewEventsHandler(client kubernetes.Interface) *EventsHandler {
	return &EventsHandler{client: client}
}

// EventResponse is the JSON response for the events endpoint.
type EventResponse struct {
	Events  []Event `json:"events"`
	Summary Summary `json:"summary"`
}

// Event is a simplified Kubernetes event for the API response.
type Event struct {
	Type           string         `json:"type"`
	Reason         string         `json:"reason"`
	Message        string         `json:"message"`
	InvolvedObject InvolvedObject `json:"involvedObject"`
	Count          int32          `json:"count"`
	FirstTimestamp string         `json:"firstTimestamp"`
	LastTimestamp   string         `json:"lastTimestamp"`
	Source         Source         `json:"source"`
}

// InvolvedObject identifies the Kubernetes resource an event is about.
type InvolvedObject struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

// Source identifies the component that generated the event.
type Source struct {
	Component string `json:"component"`
	Host      string `json:"host"`
}

// Summary provides aggregate counts of events.
type Summary struct {
	Total    int `json:"total"`
	Warnings int `json:"warnings"`
	Normal   int `json:"normal"`
}

// parseSince parses a duration string like "1h", "6h", "24h", "7d" into a time.Duration.
func parseSince(s string) (time.Duration, error) {
	if s == "" {
		return time.Hour, nil // default 1h
	}
	// Handle day suffix
	if strings.HasSuffix(s, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(s, "d"))
		if err != nil {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(s)
}

// eventTimestamp returns the most relevant timestamp for an event.
func eventTimestamp(e *corev1.Event) time.Time {
	if !e.LastTimestamp.IsZero() {
		return e.LastTimestamp.Time
	}
	if e.Series != nil && !e.Series.LastObservedTime.IsZero() {
		return e.Series.LastObservedTime.Time
	}
	if !e.EventTime.IsZero() {
		return e.EventTime.Time
	}
	return e.CreationTimestamp.Time
}

// eventFirstTimestamp returns the earliest timestamp for an event.
func eventFirstTimestamp(e *corev1.Event) time.Time {
	if !e.FirstTimestamp.IsZero() {
		return e.FirstTimestamp.Time
	}
	if !e.EventTime.IsZero() {
		return e.EventTime.Time
	}
	return e.CreationTimestamp.Time
}

// Handle serves GET /api/v1/events.
func (h *EventsHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if !requireAppHeader(w, r) {
		return
	}

	namespace := r.URL.Query().Get("namespace")
	if !validateNamespace(w, namespace) {
		return
	}

	auditLog(r, "list_events", namespace)

	kind := r.URL.Query().Get("kind")
	name := r.URL.Query().Get("name")
	eventType := r.URL.Query().Get("type")
	sinceStr := r.URL.Query().Get("since")

	since, err := parseSince(sinceStr)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid since parameter")
		return
	}

	cutoff := time.Now().Add(-since)

	events, err := h.client.CoreV1().Events(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		slog.Error("failed to list events", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list events")
		return
	}

	result := filterAndConvert(events.Items, kind, name, eventType, cutoff)

	WriteJSON(w, result)
}

// filterAndConvert filters Kubernetes events and converts them to the API response format.
func filterAndConvert(items []corev1.Event, kind, name, eventType string, cutoff time.Time) EventResponse {
	var filtered []Event
	warnings := 0
	normal := 0

	for i := range items {
		e := &items[i]

		ts := eventTimestamp(e)
		if ts.Before(cutoff) {
			continue
		}

		if kind != "" && e.InvolvedObject.Kind != kind {
			continue
		}
		if name != "" && e.InvolvedObject.Name != name {
			continue
		}
		if eventType != "" && e.Type != eventType {
			continue
		}

		count := e.Count
		if count == 0 {
			count = 1
		}

		ev := Event{
			Type:    e.Type,
			Reason:  e.Reason,
			Message: e.Message,
			InvolvedObject: InvolvedObject{
				Kind:      e.InvolvedObject.Kind,
				Name:      e.InvolvedObject.Name,
				Namespace: e.InvolvedObject.Namespace,
			},
			Count:          count,
			FirstTimestamp: eventFirstTimestamp(e).UTC().Format(time.RFC3339),
			LastTimestamp:  ts.UTC().Format(time.RFC3339),
			Source: Source{
				Component: e.Source.Component,
				Host:      e.Source.Host,
			},
		}

		if e.Type == corev1.EventTypeWarning {
			warnings++
		} else {
			normal++
		}

		filtered = append(filtered, ev)
	}

	// Sort by lastTimestamp descending.
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].LastTimestamp > filtered[j].LastTimestamp
	})

	return EventResponse{
		Events: filtered,
		Summary: Summary{
			Total:    len(filtered),
			Warnings: warnings,
			Normal:   normal,
		},
	}
}

