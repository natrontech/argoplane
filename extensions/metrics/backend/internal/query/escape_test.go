package query

import (
	"strings"
	"testing"
)

func TestEscapePromQLLabel_EscapesQuotes(t *testing.T) {
	// A value containing a double quote must be escaped so it cannot terminate
	// the matcher and inject extra PromQL.
	in := `prod",__name__=~".+`
	got := EscapePromQLLabel(in)

	matcher := `namespace="` + got + `"`

	// The escaped value must not contain an unescaped double quote, otherwise it
	// would break out of namespace="...".
	if hasUnescapedQuote(got) {
		t.Fatalf("escaped value still contains an unescaped quote: %q (matcher %q)", got, matcher)
	}
	if !strings.Contains(got, `\"`) {
		t.Fatalf("expected escaped quote in output, got %q", got)
	}
}

func TestEscapePromQLLabel_EscapesBackslash(t *testing.T) {
	got := EscapePromQLLabel(`a\b`)
	if got != `a\\b` {
		t.Fatalf("expected backslash to be doubled, got %q", got)
	}
}

// hasUnescapedQuote reports whether s contains a double quote that is not
// preceded by an escaping backslash.
func hasUnescapedQuote(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] != '"' {
			continue
		}
		backslashes := 0
		for j := i - 1; j >= 0 && s[j] == '\\'; j-- {
			backslashes++
		}
		if backslashes%2 == 0 {
			return true
		}
	}
	return false
}
