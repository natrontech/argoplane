package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/logs/backend/internal/logql"
	"github.com/natrontech/argoplane/extensions/logs/backend/internal/loki"
)

// Logs handles log query requests.
type Logs struct {
	loki *loki.Client
}

// NewLogs creates a Logs handler.
func NewLogs(loki *loki.Client) *Logs {
	return &Logs{loki: loki}
}

type logsResponse struct {
	Entries []loki.LogEntry  `json:"entries"`
	Stats   *loki.QueryStats `json:"stats"`
}

// Handle processes GET /api/v1/logs requests.
func (h *Logs) Handle(w http.ResponseWriter, r *http.Request) {
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
	direction := q.Get("direction")
	if direction == "" {
		direction = "backward"
	}

	limit := 500
	if l := q.Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 5000 {
			limit = parsed
		}
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

	// Build LogQL query
	selector := logql.BuildSelector(namespace, pod, resource, kind, container)
	query := logql.WithFilter(selector, filter)
	if severity != "" {
		severities := strings.Split(severity, ",")
		query = logql.WithSeverity(query, severities)
	}

	username := r.Header.Get("Argocd-Username")
	slog.Debug("logs query", "namespace", namespace, "pod", pod, "kind", kind, "query", query, "user", username)

	entries, stats, err := h.loki.QueryRange(r.Context(), query, start, end, limit, direction)
	if err != nil {
		slog.Warn("loki query failed", "error", err, "query", query)
		writeError(w, http.StatusBadGateway, "failed to query logs")
		return
	}

	if entries == nil {
		entries = []loki.LogEntry{}
	}

	writeJSON(w, logsResponse{
		Entries: entries,
		Stats:   stats,
	})
}
