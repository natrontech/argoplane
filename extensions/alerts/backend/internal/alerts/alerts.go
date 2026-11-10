// Package alerts decides which alerts and rules an ArgoCD Application may see,
// and turns them into the extension's API shape.
//
// Nothing here depends on a label convention of a particular install. Scoping
// uses the namespace label (configurable), and ownership uses where a rule
// came from: a rule loaded from one of the Application's own PrometheusRules is
// the app's, anything else is the platform's.
package alerts

import (
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/alertmanager"
	"github.com/natrontech/argoplane/extensions/alerts/backend/internal/prometheus"
)

// Owner values.
const (
	OwnerApp      = "app"
	OwnerPlatform = "platform"
)

// Normalised severities. Anything unrecognised is SeverityUnknown.
const (
	SeverityCritical = "critical"
	SeverityWarning  = "warning"
	SeverityInfo     = "info"
	SeverityUnknown  = "unknown"
)

// Config holds the install-specific label and annotation names.
type Config struct {
	NamespaceLabel  string
	SeverityLabel   string
	ClusterLabel    string
	LinkAnnotations []string
	// PrometheusExternalURL is the browser-reachable Prometheus URL. When set,
	// every rule gets a link to its expression there.
	PrometheusExternalURL string
}

// Scope is what one request may see.
type Scope struct {
	// Namespaces the request may read alerts from.
	Namespaces map[string]struct{}
	// AppRuleFiles are the base names of the rule files loaded from the
	// Application's own PrometheusRules.
	AppRuleFiles map[string]struct{}
	// Cluster is the CLUSTER_LABEL value alerts must carry; "" for no filter.
	Cluster string
	// AppWide is true when the request covers the whole Application rather
	// than one namespace or resource. Only then are app-owned alerts without
	// a namespace label shown: they cannot be attributed to anything smaller.
	AppWide bool
	// Resource, when set, keeps only alerts about that workload.
	Resource *Resource
}

// Resource identifies a workload to filter alerts by.
type Resource struct {
	Kind      string
	Name      string
	Namespace string
}

// Link is a URL taken from an annotation or built from the rule.
type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// Alert is one active alert as the API returns it.
type Alert struct {
	Name        string            `json:"name"`
	State       string            `json:"state"`
	Severity    string            `json:"severity"`
	SeverityRaw string            `json:"severityRaw,omitempty"`
	Summary     string            `json:"summary,omitempty"`
	Description string            `json:"description,omitempty"`
	Owner       string            `json:"owner"`
	Namespace   string            `json:"namespace,omitempty"`
	Labels      map[string]string `json:"labels"`
	ActiveAt    *time.Time        `json:"activeAt,omitempty"`
	Value       string            `json:"value,omitempty"`
	Group       string            `json:"group"`
	Silenced    bool              `json:"silenced"`
	Inhibited   bool              `json:"inhibited"`
	Links       []Link            `json:"links"`
}

// Summary counts the selected alerts. Firing and the severity counts exclude
// silenced or inhibited alerts, which only count towards Suppressed.
type Summary struct {
	Firing     int `json:"firing"`
	Pending    int `json:"pending"`
	Suppressed int `json:"suppressed"`
	Critical   int `json:"critical"`
	Warning    int `json:"warning"`
	Info       int `json:"info"`
	Unknown    int `json:"unknown"`
}

// Rule is one of the Application's own alerting rules.
type Rule struct {
	Name      string `json:"name"`
	Group     string `json:"group"`
	Query     string `json:"query"`
	For       string `json:"for,omitempty"`
	Severity  string `json:"severity"`
	Summary   string `json:"summary,omitempty"`
	Health    string `json:"health"`
	LastError string `json:"lastError,omitempty"`
	State     string `json:"state"`
	Firing    int    `json:"firing"`
	Pending   int    `json:"pending"`
	Links     []Link `json:"links"`
}

// Select returns the active alerts the scope may see, firing first, then by
// severity and age. am may be nil when no Alertmanager is configured.
func Select(groups []prometheus.RuleGroup, am []alertmanager.Alert, s Scope, cfg Config) []Alert {
	out := []Alert{}
	for _, g := range groups {
		owner := OwnerPlatform
		if _, ok := s.AppRuleFiles[path.Base(g.File)]; ok {
			owner = OwnerApp
		}
		for _, r := range g.Rules {
			for _, a := range r.Alerts {
				if !visible(a.Labels, owner, s, cfg) {
					continue
				}
				silenced, inhibited := suppression(am, a.Labels)
				sev, raw := severity(a.Labels[cfg.SeverityLabel])
				out = append(out, Alert{
					Name:        r.Name,
					State:       a.State,
					Severity:    sev,
					SeverityRaw: raw,
					Summary:     firstOf(a.Annotations, "summary", "message"),
					Description: a.Annotations["description"],
					Owner:       owner,
					Namespace:   a.Labels[cfg.NamespaceLabel],
					Labels:      a.Labels,
					ActiveAt:    a.ActiveAt,
					Value:       a.Value,
					Group:       g.Name,
					Silenced:    silenced,
					Inhibited:   inhibited,
					Links:       links(a.Annotations, r.Query, cfg),
				})
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].State != out[j].State {
			return out[i].State == "firing"
		}
		if ri, rj := severityRank(out[i].Severity), severityRank(out[j].Severity); ri != rj {
			return ri < rj
		}
		return activeAt(out[i]).After(activeAt(out[j]))
	})
	return out
}

// Summarize counts alerts by state and, for firing ones, by severity.
func Summarize(alerts []Alert) Summary {
	var s Summary
	for _, a := range alerts {
		if a.Silenced || a.Inhibited {
			s.Suppressed++
			continue
		}
		if a.State != "firing" {
			s.Pending++
			continue
		}
		s.Firing++
		switch a.Severity {
		case SeverityCritical:
			s.Critical++
		case SeverityWarning:
			s.Warning++
		case SeverityInfo:
			s.Info++
		default:
			s.Unknown++
		}
	}
	return s
}

// AppRules returns the alerting rules loaded from the Application's own
// PrometheusRules. Platform rules are not listed: until one fires, nothing
// ties it to this Application.
func AppRules(groups []prometheus.RuleGroup, s Scope, cfg Config) []Rule {
	out := []Rule{}
	for _, g := range groups {
		if _, ok := s.AppRuleFiles[path.Base(g.File)]; !ok {
			continue
		}
		for _, r := range g.Rules {
			sev, _ := severity(r.Labels[cfg.SeverityLabel])
			rule := Rule{
				Name:      r.Name,
				Group:     g.Name,
				Query:     r.Query,
				For:       forDuration(r.Duration),
				Severity:  sev,
				Summary:   firstOf(r.Annotations, "summary", "message"),
				Health:    r.Health,
				LastError: r.LastError,
				State:     r.State,
				Links:     links(r.Annotations, r.Query, cfg),
			}
			for _, a := range r.Alerts {
				if !visible(a.Labels, OwnerApp, s, cfg) {
					continue
				}
				if a.State == "firing" {
					rule.Firing++
				} else {
					rule.Pending++
				}
			}
			out = append(out, rule)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Group != out[j].Group {
			return out[i].Group < out[j].Group
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// visible decides whether an alert may be shown. This is authorisation, so
// every branch fails closed.
func visible(labels map[string]string, owner string, s Scope, cfg Config) bool {
	if cfg.ClusterLabel != "" && s.Cluster != "" && labels[cfg.ClusterLabel] != s.Cluster {
		return false
	}
	ns := labels[cfg.NamespaceLabel]
	if ns == "" {
		// Node, cluster or control-plane alerts have no namespace and are
		// never shown in an app's scope. An app's own rule that aggregates
		// the namespace away is the one exception, and only app-wide.
		return owner == OwnerApp && s.AppWide && s.Resource == nil
	}
	if _, ok := s.Namespaces[ns]; !ok {
		// Also drops an app-owned rule's alert about another namespace, so a
		// rule querying other teams' namespaces cannot leak their labels.
		return false
	}
	if s.Resource != nil {
		return ns == s.Resource.Namespace && matchesResource(labels, *s.Resource)
	}
	return true
}

// matchesResource reports whether an alert is about the given workload, using
// kube-state-metrics' label names and the pod names each controller produces:
// a ReplicaSet hash of 6-10 characters plus a 5-character suffix, an ordinal,
// or a 5-character suffix. The exact lengths keep Deployment "web" from
// claiming pod "web-api-0" of StatefulSet "web-api".
func matchesResource(labels map[string]string, r Resource) bool {
	name := regexp.QuoteMeta(r.Name)
	pod := labels["pod"]
	switch r.Kind {
	case "Pod":
		return pod == r.Name
	case "Deployment":
		return labels["deployment"] == r.Name ||
			regexp.MustCompile(`^`+name+`-[a-z0-9]{6,10}-[a-z0-9]{5}$`).MatchString(pod)
	case "StatefulSet":
		return labels["statefulset"] == r.Name ||
			regexp.MustCompile(`^`+name+`-[0-9]+$`).MatchString(pod)
	case "DaemonSet":
		return labels["daemonset"] == r.Name ||
			regexp.MustCompile(`^`+name+`-[a-z0-9]{5}$`).MatchString(pod)
	case "Job":
		return labels["job_name"] == r.Name ||
			regexp.MustCompile(`^`+name+`-[a-z0-9]{5}$`).MatchString(pod)
	}
	return false
}

// suppression reports whether Alertmanager silences or inhibits an alert.
// Alertmanager's copy also carries the server's external labels, so a match
// is every Prometheus label present with the same value.
func suppression(am []alertmanager.Alert, labels map[string]string) (silenced, inhibited bool) {
	for _, a := range am {
		if !containsAll(a.Labels, labels) {
			continue
		}
		silenced = silenced || len(a.Status.SilencedBy) > 0
		inhibited = inhibited || len(a.Status.InhibitedBy) > 0
	}
	return silenced, inhibited
}

func containsAll(have, want map[string]string) bool {
	for k, v := range want {
		if have[k] != v {
			return false
		}
	}
	return true
}

// severity maps the many spellings installs use onto four levels, and keeps
// the original value when it differs.
func severity(raw string) (normalised, original string) {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "critical", "crit", "page", "error", "high", "emergency", "fatal", "p1":
		normalised = SeverityCritical
	case "warning", "warn", "medium", "p2", "p3":
		normalised = SeverityWarning
	case "info", "informational", "low", "notice", "none", "p4", "p5":
		normalised = SeverityInfo
	default:
		normalised = SeverityUnknown
	}
	if v != normalised {
		original = raw
	}
	return normalised, original
}

func severityRank(s string) int {
	switch s {
	case SeverityCritical:
		return 0
	case SeverityWarning:
		return 1
	case SeverityInfo:
		return 2
	}
	return 3
}

// links collects http(s) URLs from the configured annotations, plus a link to
// the rule's expression in Prometheus. Annotations are written by whoever can
// create a PrometheusRule, so any other scheme (javascript:, data:) is dropped.
func links(annotations map[string]string, query string, cfg Config) []Link {
	out := []Link{}
	for _, key := range cfg.LinkAnnotations {
		if u := annotations[key]; safeURL(u) {
			out = append(out, Link{Label: linkLabel(key), URL: u})
		}
	}
	if cfg.PrometheusExternalURL != "" && query != "" {
		u := strings.TrimSuffix(cfg.PrometheusExternalURL, "/") +
			"/graph?g0.expr=" + url.QueryEscape(query) + "&g0.tab=0"
		if safeURL(u) {
			out = append(out, Link{Label: "Prometheus", URL: u})
		}
	}
	return out
}

func safeURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// linkLabel turns "runbook_url" into "Runbook".
func linkLabel(key string) string {
	label := strings.TrimSuffix(strings.TrimSuffix(key, "_url"), "URL")
	label = strings.ReplaceAll(label, "_", " ")
	if label == "" {
		return key
	}
	return strings.ToUpper(label[:1]) + label[1:]
}

func firstOf(m map[string]string, keys ...string) string {
	for _, k := range keys {
		if v := m[k]; v != "" {
			return v
		}
	}
	return ""
}

func forDuration(seconds float64) string {
	if seconds <= 0 {
		return ""
	}
	return (time.Duration(seconds) * time.Second).String()
}

func activeAt(a Alert) time.Time {
	if a.ActiveAt == nil {
		return time.Time{}
	}
	return *a.ActiveAt
}
