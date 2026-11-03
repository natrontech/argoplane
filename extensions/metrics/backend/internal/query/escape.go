package query

import "strings"

// EscapePromQLLabel escapes a user-controlled value so it can be safely placed
// inside a PromQL exact label matcher (label="<value>"). It escapes backslashes
// first, then double quotes, so the value cannot break out of the matcher.
func EscapePromQLLabel(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

// ClusterMatcher returns `,<label>="<cluster>"` for appending to a selector,
// or "" when the cluster filter is off (empty label or cluster). The label
// must already be validated as a label name.
func ClusterMatcher(label, cluster string) string {
	if label == "" || cluster == "" {
		return ""
	}
	return `,` + label + `="` + EscapePromQLLabel(cluster) + `"`
}
