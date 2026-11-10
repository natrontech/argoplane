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
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/kubernetes"
)

// eventListLimit caps the number of events fetched per List call.
const eventListLimit = 500

// maxEvents bounds the events kept for one response; the newest ones win.
const maxEvents = 5000

// maxScanTime bounds paging, leaving requestTimeout room to answer with what was
// read. The default client-go rate limit makes a huge namespace take this long.
const maxScanTime = 10 * time.Second

// requestTimeout bounds the time spent serving a single events request.
const requestTimeout = 15 * time.Second

// EventsHandler handles Kubernetes event queries.
type EventsHandler struct {
	clients Clients
	auth    *Authorizer
}

// NewEventsHandler creates a new events handler.
func NewEventsHandler(clients Clients, auth *Authorizer) *EventsHandler {
	return &EventsHandler{clients: clients, auth: auth}
}

// EventResponse is the JSON response for the events endpoint.
type EventResponse struct {
	Events  []Event `json:"events"`
	Summary Summary `json:"summary"`
	// Truncated is true when the time window holds more events than one
	// response carries, or more than one request can read.
	Truncated bool `json:"truncated,omitempty"`
}

// Event is a simplified Kubernetes event for the API response.
type Event struct {
	Type           string         `json:"type"`
	Reason         string         `json:"reason"`
	Message        string         `json:"message"`
	InvolvedObject InvolvedObject `json:"involvedObject"`
	Count          int32          `json:"count"`
	FirstTimestamp string         `json:"firstTimestamp"`
	LastTimestamp  string         `json:"lastTimestamp"`
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

	client, err := clientFor(h.clients, h.auth, r)
	if err != nil {
		WriteError(w, http.StatusBadGateway, "cannot reach the cluster this application deploys to")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	// Let the API server filter by object so a busy namespace's other events
	// don't have to be read.
	sel := fields.Set{}
	if kind != "" {
		sel["involvedObject.kind"] = kind
	}
	if name != "" {
		sel["involvedObject.name"] = name
	}
	opts := metav1.ListOptions{Limit: eventListLimit, FieldSelector: fields.SelectorFromSet(sel).String()}
	items, truncated, err := recentEvents(ctx, client, namespace, opts, cutoff, time.Now().Add(maxScanTime))
	if err != nil {
		slog.Error("failed to list events", "error", err, "namespace", namespace)
		WriteError(w, http.StatusInternalServerError, "failed to list events")
		return
	}

	result := filterAndConvert(items, kind, name, eventType, cutoff)
	result.Truncated = truncated

	WriteJSON(w, result)
}

// recentEvents pages through the event list and keeps the newest maxEvents not
// older than cutoff. The API server returns events in name order, so stopping at
// a count would drop the newest ones. Paging stops early after stopAt. truncated
// reports that events were dropped or left unread.
func recentEvents(ctx context.Context, client kubernetes.Interface, namespace string, opts metav1.ListOptions, cutoff, stopAt time.Time) ([]corev1.Event, bool, error) {
	var items []corev1.Event
	truncated := false
	for {
		events, err := client.CoreV1().Events(namespace).List(ctx, opts)
		if err != nil {
			return nil, false, fmt.Errorf("failed to list events: %w", err)
		}
		for i := range events.Items {
			if !eventTimestamp(&events.Items[i]).Before(cutoff) {
				items = append(items, events.Items[i])
			}
		}
		if len(items) > maxEvents {
			// Break timestamp ties by name so refreshes keep the same events.
			sort.Slice(items, func(i, j int) bool {
				ti, tj := eventTimestamp(&items[i]), eventTimestamp(&items[j])
				if ti.Equal(tj) {
					return items[i].Name > items[j].Name
				}
				return ti.After(tj)
			})
			items = items[:maxEvents]
			truncated = true
		}
		if events.Continue == "" {
			return items, truncated, nil
		}
		if time.Now().After(stopAt) {
			slog.Warn("event scan stopped early", "namespace", namespace, "kept", len(items))
			return items, true, nil
		}
		opts.Continue = events.Continue
	}
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
