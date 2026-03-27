package handler

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/logs/backend/internal/logql"
	"github.com/natrontech/argoplane/extensions/logs/backend/internal/loki"
)

// Volume handles log volume requests.
type Volume struct {
	loki *loki.Client
}

// NewVolume creates a Volume handler.
func NewVolume(loki *loki.Client) *Volume {
	return &Volume{loki: loki}
}

type volumeResponse struct {
	Series []loki.VolumePoint `json:"series"`
}

// Handle processes GET /api/v1/logs/volume requests.
func (h *Volume) Handle(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	namespace := q.Get("namespace")
	if namespace == "" {
		writeError(w, http.StatusBadRequest, "namespace is required")
		return
	}

	pod := q.Get("pod")
	resource := q.Get("resource")
	kind := q.Get("kind")
	container := q.Get("container")
	filter := q.Get("filter")
	severity := q.Get("severity")
	var scopedPods []string
	if p := q.Get("pods"); p != "" {
		scopedPods = strings.Split(p, ",")
	}

	end := time.Now()
	start := end.Add(-1 * time.Hour)
	if s := q.Get("start"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			start = t
		}
	}
	if e := q.Get("end"); e != "" {
		if t, err := time.Parse(time.RFC3339, e); err == nil {
			end = t
		}
	}

	// Calculate step based on time range
	duration := end.Sub(start)
	step := calculateStep(duration)

	// Build LogQL query
	selector := logql.BuildSelector(namespace, pod, resource, kind, container, scopedPods)
	query := logql.WithFilter(selector, filter)
	if severity != "" {
		severities := strings.Split(severity, ",")
		query = logql.WithSeverity(query, severities)
	}
	volumeQuery := logql.VolumeQuery(query, step.String())

	username := r.Header.Get("Argocd-Username")
	slog.Debug("volume query", "namespace", namespace, "query", volumeQuery, "user", username)

	points, err := h.loki.VolumeRange(r.Context(), volumeQuery, start, end, step)
	if err != nil {
		slog.Warn("volume query failed", "error", err, "query", volumeQuery)
		writeError(w, http.StatusBadGateway, "failed to query log volume")
		return
	}

	if points == nil {
		points = []loki.VolumePoint{}
	}

	writeJSON(w, volumeResponse{Series: points})
}

func calculateStep(duration time.Duration) time.Duration {
	switch {
	case duration <= 15*time.Minute:
		return 30 * time.Second
	case duration <= 1*time.Hour:
		return 1 * time.Minute
	case duration <= 6*time.Hour:
		return 5 * time.Minute
	case duration <= 24*time.Hour:
		return 15 * time.Minute
	default:
		return 1 * time.Hour
	}
}
