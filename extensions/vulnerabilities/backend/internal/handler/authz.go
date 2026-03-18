package handler

import (
	"log/slog"
	"net/http"
)

// auditLog emits a structured security audit log entry.
func auditLog(r *http.Request, action, namespace string, extra ...any) {
	args := []any{
		"action", action,
		"namespace", namespace,
		"user", r.Header.Get("Argocd-Username"),
		"app", r.Header.Get("Argocd-Application-Name"),
		"project", r.Header.Get("Argocd-Project-Name"),
	}
	args = append(args, extra...)
	slog.Info("security.audit", args...)
}
