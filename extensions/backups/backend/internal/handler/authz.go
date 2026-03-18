package handler

import (
	"log/slog"
	"net/http"
)

// scheduleOwnershipPlatform marks a schedule as platform-managed (not app-scoped).
const scheduleOwnershipPlatform = "platform"

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

// isScheduleAppOwned returns true if the schedule explicitly includes only the
// target namespace (i.e., it is scoped to a specific app's namespace).
// Platform schedules have empty includedNamespaces (back up everything) or
// include multiple namespaces.
func isScheduleAppOwned(includedNamespaces []string, targetNamespace string) bool {
	if len(includedNamespaces) == 0 {
		return false // empty = cluster-wide = platform
	}
	if len(includedNamespaces) == 1 && includedNamespaces[0] == targetNamespace {
		return true
	}
	return false
}
