package logql

import (
	"fmt"
	"regexp"
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

// ForPods builds a LogQL stream selector matching a specific set of pods.
func ForPods(namespace string, pods []string, container string) string {
	escaped := make([]string, len(pods))
	for i, p := range pods {
		escaped[i] = regexp.QuoteMeta(p)
	}
	podRegex := strings.Join(escaped, "|")
	if container != "" {
		return fmt.Sprintf(`{namespace=%q, pod=~%q, container=%q}`, namespace, podRegex, container)
	}
	return fmt.Sprintf(`{namespace=%q, pod=~%q}`, namespace, podRegex)
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
// Each severity value is escaped to prevent regex injection.
func WithSeverity(base string, severities []string) string {
	if len(severities) == 0 {
		return base
	}
	escaped := make([]string, len(severities))
	for i, s := range severities {
		escaped[i] = regexp.QuoteMeta(s)
	}
	pattern := strings.Join(escaped, "|")
	return fmt.Sprintf(`%s |~ "(?i)(%s)"`, base, pattern)
}

// VolumeQuery wraps a stream selector in count_over_time for volume charts.
func VolumeQuery(selector string, step string) string {
	return fmt.Sprintf(`sum(count_over_time(%s[%s]))`, selector, step)
}

// BuildSelector constructs a LogQL stream selector from query parameters.
// When pods is non-empty, the selector is scoped to those pods only.
func BuildSelector(namespace, pod, resource, kind, container string, pods []string) string {
	switch {
	case pod != "":
		return ForPod(namespace, pod, container)
	case resource != "" && kind == "Deployment":
		return ForDeployment(namespace, resource, container)
	case resource != "" && kind == "StatefulSet":
		return ForStatefulSet(namespace, resource, container)
	case len(pods) > 0:
		return ForPods(namespace, pods, container)
	default:
		return ForNamespace(namespace, container)
	}
}
