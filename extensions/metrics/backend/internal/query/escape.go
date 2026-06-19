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
