package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/natrontech/argoplane/extensions/backups/backend/internal/types"
)

// scheduleOwnershipPlatform marks a schedule as platform-managed (not app-scoped).
const scheduleOwnershipPlatform = "platform"

var applicationGVR = schema.GroupVersionResource{Group: "argoproj.io", Version: "v1alpha1", Resource: "applications"}

// Authorizer resolves the set of namespaces a calling ArgoCD Application manages
// and enforces that mutations / per-app reads stay within that set.
type Authorizer struct{ client dynamic.Interface }

// NewAuthorizer creates a new Authorizer.
func NewAuthorizer(client dynamic.Interface) *Authorizer { return &Authorizer{client: client} }

// Allowed returns the namespaces the Application named in the Argocd-Application-Name
// header manages (its destination namespace plus every status.resources namespace).
// On a missing/invalid header or lookup failure it writes a 403 and returns ok=false.
func (a *Authorizer) Allowed(w http.ResponseWriter, r *http.Request) (map[string]struct{}, bool) {
	appNs, appName, ok := appFromHeader(r)
	if !ok {
		WriteError(w, http.StatusForbidden, "request must come through ArgoCD proxy")
		return nil, false
	}
	allowed, err := a.allowedNamespaces(r.Context(), appNs, appName)
	if err != nil {
		slog.Warn("authorization lookup failed", "app", appName, "appNamespace", appNs, "error", err)
		WriteError(w, http.StatusForbidden, "unable to authorize namespace")
		return nil, false
	}
	return allowed, true
}

// AuthorizeNamespace enforces that `requested` is managed by the calling Application.
func (a *Authorizer) AuthorizeNamespace(w http.ResponseWriter, r *http.Request, requested string) bool {
	allowed, ok := a.Allowed(w, r)
	if !ok {
		return false
	}
	if _, ok := allowed[requested]; !ok {
		auditLog(r, "authz.namespace.rejected", requested)
		WriteError(w, http.StatusForbidden, "namespace not managed by this application")
		return false
	}
	return true
}

func appFromHeader(r *http.Request) (namespace, name string, ok bool) {
	parts := strings.SplitN(r.Header.Get("Argocd-Application-Name"), ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// resourceNamespaces returns the namespaces covered by the backup or restore
// addressed by a Velero DownloadRequest kind. For BackupLog/BackupResults it reads
// the Backup's spec.includedNamespaces. For RestoreLog/RestoreResults it reads the
// Restore's spec.includedNamespaces, falling back to the source backup's
// includedNamespaces when the restore does not narrow the scope itself.
func resourceNamespaces(ctx context.Context, client dynamic.Interface, veleroNamespace, kind, name string) ([]string, error) {
	switch kind {
	case "BackupLog", "BackupResults":
		backup, err := client.Resource(types.BackupGVR).Namespace(veleroNamespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("get backup %s: %w", name, err)
		}
		return nestedStringSlice(backup.Object, "spec", "includedNamespaces"), nil
	case "RestoreLog", "RestoreResults":
		restore, err := client.Resource(types.RestoreGVR).Namespace(veleroNamespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("get restore %s: %w", name, err)
		}
		if ns := nestedStringSlice(restore.Object, "spec", "includedNamespaces"); len(ns) > 0 {
			return ns, nil
		}
		backupName, _, _ := unstructured.NestedString(restore.Object, "spec", "backupName")
		if backupName == "" {
			return nil, nil
		}
		backup, err := client.Resource(types.BackupGVR).Namespace(veleroNamespace).Get(ctx, backupName, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("get source backup %s: %w", backupName, err)
		}
		return nestedStringSlice(backup.Object, "spec", "includedNamespaces"), nil
	default:
		return nil, fmt.Errorf("unsupported kind %q", kind)
	}
}

// namespacesSubsetOf returns true when `namespaces` is non-empty and every entry
// is present in `allowed`. An empty list means cluster-wide / platform scope and
// is never a subset (callers use this to reject platform resources).
func namespacesSubsetOf(namespaces []string, allowed map[string]struct{}) bool {
	if len(namespaces) == 0 {
		return false
	}
	for _, ns := range namespaces {
		if _, ok := allowed[ns]; !ok {
			return false
		}
	}
	return true
}

func (a *Authorizer) allowedNamespaces(ctx context.Context, appNs, appName string) (map[string]struct{}, error) {
	app, err := a.client.Resource(applicationGVR).Namespace(appNs).Get(ctx, appName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get application %s/%s: %w", appNs, appName, err)
	}
	allowed := make(map[string]struct{})
	if dest, found, _ := unstructured.NestedString(app.Object, "spec", "destination", "namespace"); found && dest != "" {
		allowed[dest] = struct{}{}
	}
	resources, _, _ := unstructured.NestedSlice(app.Object, "status", "resources")
	for _, res := range resources {
		m, ok := res.(map[string]interface{})
		if !ok {
			continue
		}
		if ns, ok := m["namespace"].(string); ok && ns != "" {
			allowed[ns] = struct{}{}
		}
	}
	return allowed, nil
}

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
