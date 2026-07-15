package handler

import (
	"context"
	"fmt"
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

// eventListLimit caps the number of events fetched per List call.
const eventListLimit = 500

// maxEvents bounds the total events accumulated across paginated List calls.
// ponytail: 5000 covers even busy namespaces within the default 1h event TTL;
// raise it or add server-side field selectors if that ever proves too small.
const maxEvents = 5000

// requestTimeout bounds the time spent serving a single events request.
const requestTimeout = 15 * time.Second

// EventsHandler handles Kubernetes event queries.
type EventsHandler struct {
	client kubernetes.Interface
	auth   *Authorizer
}

// NewEventsHandler creates a new events handler.
func NewEventsHandler(client kubernetes.Interface, auth *Authorizer) *EventsHandler {
	return &EventsHandler{client: client, auth: auth}
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

// maxSinceDays caps the since parameter so the duration cannot overflow
// (or produce a cutoff in the future via negative values).
const maxSinceDays = 3650

// parseSince parses a duration string like "1h", "6h", "24h", "7d" into a time.Duration.
func parseSince(s string) (time.Duration, error) {
	if s == "" {
		return time.Hour, nil // default 1h
	}
	var d time.Duration
	if strings.HasSuffix(s, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(s, "d"))
		if err != nil {
			return 0, err
		}
		if days <= 0 || days > maxSinceDays {
			return 0, fmt.Errorf("since out of range: %s", s)
		}
		d = time.Duration(days) * 24 * time.Hour
	} else {
		var err error
		d, err = time.ParseDuration(s)
		if err != nil {
			return 0, err
		}
	}
	if d <= 0 || d > maxSinceDays*24*time.Hour {
		return 0, fmt.Errorf("since out of range: %s", s)
	}
	return d, nil
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
	namespace := r.URL.Query().Get("namespace")
	if !validateNamespace(w, namespace) {
		return
	}

	if !h.auth.AuthorizeNamespace(w, r, namespace) {
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

	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	// Page through the full event list: the API server returns events in
	// name order, so a single capped List call could drop the newest events.
	var items []corev1.Event
	opts := metav1.ListOptions{Limit: eventListLimit}
	for {
		events, err := h.client.CoreV1().Events(namespace).List(ctx, opts)
		if err != nil {
			slog.Error("failed to list events", "error", err, "namespace", namespace)
			WriteError(w, http.StatusInternalServerError, "failed to list events")
			return
		}
		items = append(items, events.Items...)
		if events.Continue == "" || len(items) >= maxEvents {
			break
		}
		opts.Continue = events.Continue
	}

	result := filterAndConvert(items, kind, name, eventType, cutoff)

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

		// Count the summary over all events in scope, before the type filter,
		// so the summary cards reflect the full picture.
		if e.Type == corev1.EventTypeWarning {
			warnings++
		} else {
			normal++
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

		filtered = append(filtered, ev)
	}

	// Sort by lastTimestamp descending.
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].LastTimestamp > filtered[j].LastTimestamp
	})

	return EventResponse{
		Events: filtered,
		Summary: Summary{
			Total:    warnings + normal,
			Warnings: warnings,
			Normal:   normal,
		},
	}
}

