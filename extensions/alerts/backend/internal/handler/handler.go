// Package handler serves the alerts extension's HTTP API.
package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alertmanager"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alerts"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/prometheus"
)

// dataTTL bounds how stale rules and silences may be. The rules API returns
// every rule on the server, so one fetch is shared by all requests in the
// window instead of one per tab and panel.
const dataTTL = 15 * time.Second

// RuleSource is the Prometheus-compatible rules API.
type RuleSource interface {
	AlertingRules(ctx context.Context) ([]prometheus.RuleGroup, error)
}

// SilenceSource is Alertmanager. It is optional.
type SilenceSource interface {
	Alerts(ctx context.Context) ([]alertmanager.Alert, error)
}

// Scoper builds the scope a request may see.
type Scoper interface {
	Scope(ctx context.Context, r *http.Request, namespace string, resource *alerts.Resource) (alerts.Scope, error)
}

// Handler serves /api/v1/alerts and /api/v1/rules.
type Handler struct {
	rules    RuleSource
	silences SilenceSource
	auth     Scoper
	cfg      alerts.Config

	mu          sync.Mutex
	groups      []prometheus.RuleGroup
	groupsUntil time.Time
	am          []alertmanager.Alert
	amUntil     time.Time
}

// New returns a Handler. silences may be nil when no Alertmanager is
// configured.
func New(rules RuleSource, silences SilenceSource, auth Scoper, cfg alerts.Config) *Handler {
	return &Handler{rules: rules, silences: silences, auth: auth, cfg: cfg}
}

// AlertsResponse is the body of GET /api/v1/alerts.
type AlertsResponse struct {
	Alerts  []alerts.Alert `json:"alerts"`
	Summary alerts.Summary `json:"summary"`
	// Warnings explain data the response could not include, such as silences
	// when Alertmanager is unreachable.
	Warnings []string `json:"warnings,omitempty"`
}

// RulesResponse is the body of GET /api/v1/rules.
type RulesResponse struct {
	Rules []alerts.Rule `json:"rules"`
}

// Alerts serves GET /api/v1/alerts?[namespace=][&kind=&name=].
func (h *Handler) Alerts(w http.ResponseWriter, r *http.Request) {
	s, ok := h.scope(w, r)
	if !ok {
		return
	}
	groups, err := h.ruleGroups(r.Context())
	if err != nil {
		slog.Error("failed to read alerting rules", "error", err)
		WriteError(w, http.StatusBadGateway, "failed to read alerting rules")
		return
	}

	resp := AlertsResponse{}
	var am []alertmanager.Alert
	if h.silences != nil {
		if am, err = h.alertmanager(r.Context()); err != nil {
			// Alerts are still correct without it, only their silences are
			// unknown: say so instead of failing the whole request.
			slog.Warn("failed to read alertmanager", "error", err)
			resp.Warnings = append(resp.Warnings, "Alertmanager is unreachable: silenced and inhibited alerts are shown as active.")
		}
	}

	resp.Alerts = alerts.Select(groups, am, s, h.cfg)
	resp.Summary = alerts.Summarize(resp.Alerts)
	auditLog(r, "list_alerts", len(resp.Alerts))
	WriteJSON(w, resp)
}

// Rules serves GET /api/v1/rules?[namespace=].
func (h *Handler) Rules(w http.ResponseWriter, r *http.Request) {
	s, ok := h.scope(w, r)
	if !ok {
		return
	}
	groups, err := h.ruleGroups(r.Context())
	if err != nil {
		slog.Error("failed to read alerting rules", "error", err)
		WriteError(w, http.StatusBadGateway, "failed to read alerting rules")
		return
	}
	rules := alerts.AppRules(groups, s, h.cfg)
	auditLog(r, "list_rules", len(rules))
	WriteJSON(w, RulesResponse{Rules: rules})
}

// scope validates the query and resolves the request's scope, writing the
// error response itself when it fails.
func (h *Handler) scope(w http.ResponseWriter, r *http.Request) (alerts.Scope, bool) {
	q := r.URL.Query()
	namespace, kind, name := q.Get("namespace"), q.Get("kind"), q.Get("name")
	for _, v := range []string{namespace, name} {
		if v != "" && !validName.MatchString(v) {
			WriteError(w, http.StatusBadRequest, "invalid namespace or name")
			return alerts.Scope{}, false
		}
	}

	var resource *alerts.Resource
	if kind != "" || name != "" {
		if kind == "" || name == "" || namespace == "" {
			WriteError(w, http.StatusBadRequest, "kind and name need each other and a namespace")
			return alerts.Scope{}, false
		}
		resource = &alerts.Resource{Kind: kind, Name: name, Namespace: namespace}
	}

	s, err := h.auth.Scope(r.Context(), r, namespace, resource)
	if err != nil {
		var fe forbiddenError
		if errors.As(err, &fe) {
			WriteError(w, http.StatusForbidden, fe.msg)
		} else {
			slog.Warn("security.rejected", "reason", "failed to resolve application scope", "error", err,
				"app", r.Header.Get("Argocd-Application-Name"))
			WriteError(w, http.StatusForbidden, "unable to authorize request")
		}
		return alerts.Scope{}, false
	}
	return s, true
}

// ruleGroups returns the rule groups, fetching at most once per dataTTL. The
// lock is held while fetching so concurrent requests share one call.
func (h *Handler) ruleGroups(ctx context.Context) ([]prometheus.RuleGroup, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if time.Now().Before(h.groupsUntil) {
		return h.groups, nil
	}
	groups, err := h.rules.AlertingRules(ctx)
	if err != nil {
		return nil, err
	}
	h.groups, h.groupsUntil = groups, time.Now().Add(dataTTL)
	return groups, nil
}

// alertmanager returns Alertmanager's alerts, fetching at most once per dataTTL.
func (h *Handler) alertmanager(ctx context.Context) ([]alertmanager.Alert, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if time.Now().Before(h.amUntil) {
		return h.am, nil
	}
	am, err := h.silences.Alerts(ctx)
	if err != nil {
		return nil, err
	}
	h.am, h.amUntil = am, time.Now().Add(dataTTL)
	return am, nil
}

// auditLog records who read which application's alerts.
func auditLog(r *http.Request, action string, count int) {
	slog.Info("security.audit",
		"action", action,
		"namespace", r.URL.Query().Get("namespace"),
		"user", r.Header.Get("Argocd-Username"),
		"user_groups", r.Header.Get("Argocd-User-Groups"),
		"app", r.Header.Get("Argocd-Application-Name"),
		"project", r.Header.Get("Argocd-Project-Name"),
		"count", count,
	)
}
