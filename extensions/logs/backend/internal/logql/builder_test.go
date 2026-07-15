package logql

import (
	"strings"
	"testing"
)

func TestForDeploymentQuotesRegexMetacharacters(t *testing.T) {
	sel := ForDeployment("default", "a.*", "")
	// The raw name "a.*" must not appear unescaped (would match any pod).
	if strings.Contains(sel, `pod=~"a.*-`) {
		t.Fatalf("regex metacharacters not quoted: %s", sel)
	}
	// QuoteMeta turns "a.*" into a\.\* which %q renders with doubled backslashes.
	if !strings.Contains(sel, `a\\.\\*-.*`) {
		t.Fatalf("expected quoted name in selector, got: %s", sel)
	}
}

func TestForStatefulSetQuotesRegexMetacharacters(t *testing.T) {
	sel := ForStatefulSet("default", "a.*", "")
	if strings.Contains(sel, `pod=~"a.*-`) {
		t.Fatalf("regex metacharacters not quoted: %s", sel)
	}
	if !strings.Contains(sel, `a\\.\\*-\\d+`) {
		t.Fatalf("expected quoted name in selector, got: %s", sel)
	}
}
