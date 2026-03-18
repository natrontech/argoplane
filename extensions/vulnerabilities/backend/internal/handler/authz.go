package handler

import (
	"log/slog"
	"net/http"
	"regexp"
	"strings"
)

// validNamespace checks that a namespace value is a valid Kubernetes name
// to prevent injection of arbitrary strings into K8s API calls.
var validNamespace = regexp.MustCompile(`^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$`)

// validateNamespace checks the namespace is a valid Kubernetes namespace name.
// Returns false and writes an error response if invalid.
func validateNamespace(w http.ResponseWriter, namespace string) bool {
	if namespace == "" {
		WriteError(w, http.StatusBadRequest, "namespace is required")
		return false
	}
	if len(namespace) > 63 || !validNamespace.MatchString(namespace) {
		WriteError(w, http.StatusBadRequest, "invalid namespace")
		return false
	}
	return true
}

// sanitizeFilename removes characters unsafe for Content-Disposition filenames.
func sanitizeFilename(s string) string {
	// Only allow alphanumeric, dash, underscore, dot.
	safe := regexp.MustCompile(`[^a-zA-Z0-9\-_.]`)
	return safe.ReplaceAllString(s, "_")
}

// auditLog emits a structured security audit log entry for all data access.
func auditLog(r *http.Request, action, namespace string, extra ...any) {
	args := []any{
		"action", action,
		"namespace", namespace,
		"user", r.Header.Get("Argocd-Username"),
		"user_groups", r.Header.Get("Argocd-User-Groups"),
		"app", r.Header.Get("Argocd-Application-Name"),
		"project", r.Header.Get("Argocd-Project-Name"),
		"remote_addr", r.RemoteAddr,
	}
	args = append(args, extra...)
	slog.Info("security.audit", args...)
}

// requireAppHeader validates that the ArgoCD proxy headers are present.
// These are injected by ArgoCD's API server after authentication.
// If missing, the request did not come through the proxy (direct access attempt).
func requireAppHeader(w http.ResponseWriter, r *http.Request) bool {
	app := r.Header.Get("Argocd-Application-Name")
	if app == "" {
		slog.Warn("security.rejected", "reason", "missing Argocd-Application-Name header", "remote_addr", r.RemoteAddr)
		WriteError(w, http.StatusForbidden, "request must come through ArgoCD proxy")
		return false
	}
	return true
}

// extractAppNamespace parses the namespace from the Argocd-Application-Name header
// which has the format "namespace:appname".
func extractAppNamespace(r *http.Request) string {
	app := r.Header.Get("Argocd-Application-Name")
	parts := strings.SplitN(app, ":", 2)
	if len(parts) == 2 {
		return parts[0]
	}
	return ""
}
