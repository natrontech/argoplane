package logql

import (
	"regexp"
	"strings"
)

var severityPatterns []severityRule

type severityRule struct {
	re       *regexp.Regexp
	severity string
}

func init() {
	rules := []struct {
		pattern  string
		severity string
	}{
		// JSON structured logs
		{`"(?:level|severity)"\s*:\s*"(?i:fatal|panic)"`, "error"},
		{`"(?:level|severity)"\s*:\s*"(?i:error|err)"`, "error"},
		{`"(?:level|severity)"\s*:\s*"(?i:warn|warning)"`, "warn"},
		{`"(?:level|severity)"\s*:\s*"(?i:info)"`, "info"},
		{`"(?:level|severity)"\s*:\s*"(?i:debug|trace)"`, "debug"},

		// Key-value format (slog, logfmt)
		{`(?:^|\s)level=(?i:fatal|panic)(?:\s|$)`, "error"},
		{`(?:^|\s)level=(?i:error|err)(?:\s|$)`, "error"},
		{`(?:^|\s)level=(?i:warn|warning)(?:\s|$)`, "warn"},
		{`(?:^|\s)level=(?i:info)(?:\s|$)`, "info"},
		{`(?:^|\s)level=(?i:debug|trace)(?:\s|$)`, "debug"},

		// Bracket format [ERROR], [WARN], etc.
		{`\[(?i:FATAL|PANIC)\]`, "error"},
		{`\[(?i:ERROR|ERR)\]`, "error"},
		{`\[(?i:WARN|WARNING)\]`, "warn"},
		{`\[(?i:INFO)\]`, "info"},
		{`\[(?i:DEBUG|TRACE)\]`, "debug"},

		// Uppercase standalone (typically at the start or after timestamp)
		{`(?:^|\s)(?:FATAL|PANIC)(?:\s|:)`, "error"},
		{`(?:^|\s)ERROR(?:\s|:)`, "error"},
		{`(?:^|\s)WARN(?:ING)?(?:\s|:)`, "warn"},
	}

	for _, r := range rules {
		severityPatterns = append(severityPatterns, severityRule{
			re:       regexp.MustCompile(r.pattern),
			severity: r.severity,
		})
	}
}

// DetectSeverity analyzes a log line and returns its severity level.
// Returns "error", "warn", "info", "debug", or "unknown".
func DetectSeverity(line string) string {
	// Fast path: check for common uppercase markers without regex
	upper := strings.ToUpper(line)
	if !strings.ContainsAny(upper, "EWDF") {
		return "info"
	}

	for _, rule := range severityPatterns {
		if rule.re.MatchString(line) {
			return rule.severity
		}
	}

	return "info"
}
