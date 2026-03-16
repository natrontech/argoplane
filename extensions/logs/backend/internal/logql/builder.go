package logql

import (
	"fmt"
	"strings"
)

// ForPod builds a LogQL stream selector for a specific pod.
func ForPod(namespace, pod, container string) string {
	sel := fmt.Sprintf(`{namespace=%q, pod=%q}`, namespace, pod)
	if container != "" {
		sel = fmt.Sprintf(`{namespace=%q, pod=%q, container=%q}`, namespace, pod, container)
	}
	return sel
}

// ForDeployment builds a LogQL stream selector matching all pods of a deployment.
func ForDeployment(namespace, name, container string) string {
	sel := fmt.Sprintf(`{namespace=%q, pod=~%q}`, namespace, name+"-.*")
	if container != "" {
		sel = fmt.Sprintf(`{namespace=%q, pod=~%q, container=%q}`, namespace, name+"-.*", container)
	}
	return sel
}

// ForStatefulSet builds a LogQL stream selector matching all pods of a statefulset.
func ForStatefulSet(namespace, name, container string) string {
	sel := fmt.Sprintf(`{namespace=%q, pod=~%q}`, namespace, name+"-\\d+")
	if container != "" {
		sel = fmt.Sprintf(`{namespace=%q, pod=~%q, container=%q}`, namespace, name+"-\\d+", container)
	}
	return sel
}

// ForNamespace builds a LogQL stream selector for an entire namespace.
func ForNamespace(namespace, container string) string {
	sel := fmt.Sprintf(`{namespace=%q}`, namespace)
	if container != "" {
		sel = fmt.Sprintf(`{namespace=%q, container=%q}`, namespace, container)
	}
	return sel
}

// WithFilter appends a line filter to a LogQL query.
func WithFilter(base, text string) string {
	if text == "" {
		return base
	}
	return fmt.Sprintf(`%s |= %q`, base, text)
}

// WithSeverity appends severity line filters for the given severities.
// This uses case-insensitive regex matching on common severity patterns.
func WithSeverity(base string, severities []string) string {
	if len(severities) == 0 {
		return base
	}
	pattern := strings.Join(severities, "|")
	return fmt.Sprintf(`%s |~ "(?i)(%s)"`, base, pattern)
}

// VolumeQuery wraps a stream selector in count_over_time for volume charts.
func VolumeQuery(selector string, step string) string {
	return fmt.Sprintf(`sum(count_over_time(%s[%s]))`, selector, step)
}

// BuildSelector constructs a LogQL stream selector from query parameters.
func BuildSelector(namespace, pod, resource, kind, container string) string {
	switch {
	case pod != "":
		return ForPod(namespace, pod, container)
	case resource != "" && kind == "Deployment":
		return ForDeployment(namespace, resource, container)
	case resource != "" && kind == "StatefulSet":
		return ForStatefulSet(namespace, resource, container)
	default:
		return ForNamespace(namespace, container)
	}
}
