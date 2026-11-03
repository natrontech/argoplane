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
	podRegex := regexp.QuoteMeta(name) + "-.*"
	sel := fmt.Sprintf(`{namespace=%q, pod=~%q}`, namespace, podRegex)
	if container != "" {
		sel = fmt.Sprintf(`{namespace=%q, pod=~%q, container=%q}`, namespace, podRegex, container)
	}
	return sel
}

// ForStatefulSet builds a LogQL stream selector matching all pods of a statefulset.
func ForStatefulSet(namespace, name, container string) string {
	podRegex := regexp.QuoteMeta(name) + "-\\d+"
	sel := fmt.Sprintf(`{namespace=%q, pod=~%q}`, namespace, podRegex)
	if container != "" {
		sel = fmt.Sprintf(`{namespace=%q, pod=~%q, container=%q}`, namespace, podRegex, container)
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

// WithCluster adds a cluster matcher to a stream selector. It is a no-op when
// label or cluster is empty. The label must already be validated as a label
// name.
func WithCluster(selector, label, cluster string) string {
	if label == "" || cluster == "" || !strings.HasSuffix(selector, "}") {
		return selector
	}
	return fmt.Sprintf(`%s, %s=%q}`, strings.TrimSuffix(selector, "}"), label, cluster)
}

// WithFilter appends a line filter to a LogQL query.
func WithFilter(base, text string) string {
	if text == "" {
		return base
	}
	return fmt.Sprintf(`%s |= %q`, base, text)
}

// WithSeverity narrows a query to lines DetectSeverity would classify as one
// of severities, using the same patterns. Matching the bare word instead
// ("error") hit info lines like `"level":"info","msg":"rpc error"`.
// "info" is also the fallback for lines without any marker, which no regex
// can select, so when it is requested the query is left unfiltered and the
// caller must filter on DetectSeverity.
func WithSeverity(base string, severities []string) string {
	var parts []string
	for _, s := range severities {
		re := severityRegex(s)
		if s == "info" || re == "" {
			return base
		}
		parts = append(parts, re)
	}
	if len(parts) == 0 {
		return base
	}
	return fmt.Sprintf(`%s |~ %q`, base, strings.Join(parts, "|"))
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
