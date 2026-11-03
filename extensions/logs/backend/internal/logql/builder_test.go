package logql

import (
	"regexp"
	"strconv"
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

func TestWithCluster(t *testing.T) {
	tests := []struct {
		name, selector, label, cluster, want string
	}{
		{name: "off", selector: ForNamespace("ns", ""), label: "", cluster: "prod", want: `{namespace="ns"}`},
		{name: "unresolved", selector: ForNamespace("ns", ""), label: "cluster", cluster: "", want: `{namespace="ns"}`},
		{name: "namespace", selector: ForNamespace("ns", ""), label: "cluster", cluster: "prod", want: `{namespace="ns", cluster="prod"}`},
		{name: "pod with container", selector: ForPod("ns", "web-0", "app"), label: "cluster", cluster: "prod", want: `{namespace="ns", pod="web-0", container="app", cluster="prod"}`},
		{name: "deployment", selector: ForDeployment("ns", "web", ""), label: "cluster", cluster: "prod", want: `{namespace="ns", pod=~"web-.*", cluster="prod"}`},
		{name: "statefulset", selector: ForStatefulSet("ns", "db", ""), label: "cluster", cluster: "prod", want: `{namespace="ns", pod=~"db-\\d+", cluster="prod"}`},
		{name: "pods", selector: ForPods("ns", []string{"a", "b"}, ""), label: "cluster", cluster: "prod", want: `{namespace="ns", pod=~"a|b", cluster="prod"}`},
		{name: "injection escaped", selector: ForNamespace("ns", ""), label: "cluster", cluster: `x"} |= "\`, want: `{namespace="ns", cluster="x\"} |= \"\\"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := WithCluster(tt.selector, tt.label, tt.cluster); got != tt.want {
				t.Errorf("WithCluster(%q, %q, %q) = %q, want %q", tt.selector, tt.label, tt.cluster, got, tt.want)
			}
		})
	}
}

func TestWithClusterBeforeFilters(t *testing.T) {
	sel := WithCluster(ForNamespace("ns", ""), "cluster", "prod")
	got := WithSeverity(WithFilter(sel, "err"), []string{"error"})
	// Only the order matters here; WithSeverity's regex is tested on its own.
	want := `{namespace="ns", cluster="prod"} |= "err" |~ `
	if !strings.HasPrefix(got, want) {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestWithSeverityMatchesDetectSeverity(t *testing.T) {
	q := WithSeverity(`{namespace="ns"}`, []string{"error"})
	quoted := q[strings.Index(q, "|~ ")+3:]
	pattern, err := strconv.Unquote(quoted)
	if err != nil {
		t.Fatalf("filter is not a valid quoted string: %s", quoted)
	}
	re := regexp.MustCompile(pattern) // Loki uses RE2, same as Go
	for line, want := range map[string]bool{
		// "error" in the message of an info line must not match.
		`{"level":"info","caller":"errorhandler/errorhandler.go:36","msg":"rpc error: code = Unavailable desc = connection error"}`: false,
		`{"level":"error","msg":"boom"}`: true,
		`time=x level=err msg=boom`:      true,
		`[FATAL] disk full`:              true,
		`2026-11-03 ERROR: failed`:       true,
	} {
		if got := re.MatchString(line); got != want {
			t.Errorf("filter match = %v, want %v for %s", got, want, line)
		}
		if got := DetectSeverity(line) == "error"; got != want {
			t.Errorf("DetectSeverity disagrees for %s", line)
		}
	}
	if got := WithSeverity("{}", []string{"error", "info"}); got != "{}" {
		t.Errorf("info can't be selected by regex, want no filter, got %s", got)
	}
}
