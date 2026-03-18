package types

import "k8s.io/apimachinery/pkg/runtime/schema"

var (
	VulnerabilityReportGVR = schema.GroupVersionResource{
		Group:    "aquasecurity.github.io",
		Version:  "v1alpha1",
		Resource: "vulnerabilityreports",
	}
	ConfigAuditReportGVR = schema.GroupVersionResource{
		Group:    "aquasecurity.github.io",
		Version:  "v1alpha1",
		Resource: "configauditreports",
	}
)

// AuditCheck represents a single configuration audit finding.
type AuditCheck struct {
	CheckID     string   `json:"checkID"`
	Title       string   `json:"title"`
	Severity    string   `json:"severity"`
	Category    string   `json:"category"`
	Description string   `json:"description"`
	Messages    []string `json:"messages"`
	Remediation string   `json:"remediation"`
	Success     bool     `json:"success"`
	Scope       string   `json:"scope,omitempty"`
}

// AuditReport represents the config audit state of a single workload.
type AuditReport struct {
	ResourceKind      string               `json:"resourceKind"`
	ResourceName      string               `json:"resourceName"`
	ResourceNamespace string               `json:"resourceNamespace"`
	Summary           VulnerabilitySummary `json:"summary"`
	Checks            []AuditCheck         `json:"checks"`
	LastScanned       string               `json:"lastScanned"`
	ReportName        string               `json:"reportName"`
}

// AuditOverviewRequest is the body for the audit overview endpoint.
type AuditOverviewRequest struct {
	Namespace string `json:"namespace"`
}

// AuditOverviewResponse is the combined config audit summary.
type AuditOverviewResponse struct {
	Summary   VulnerabilitySummary `json:"summary"`
	Reports   []AuditReport        `json:"reports"`
	Namespace string               `json:"namespace"`
}

// VulnerabilitySummary holds counts per severity level.
type VulnerabilitySummary struct {
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
	Unknown  int `json:"unknown"`
}

// Total returns the sum of all severity counts.
func (s VulnerabilitySummary) Total() int {
	return s.Critical + s.High + s.Medium + s.Low + s.Unknown
}

// Vulnerability represents a single CVE finding.
type Vulnerability struct {
	ID               string  `json:"id"`
	Severity         string  `json:"severity"`
	Score            float64 `json:"score"`
	Package          string  `json:"package"`
	InstalledVersion string  `json:"installedVersion"`
	FixedVersion     string  `json:"fixedVersion"`
	Title            string  `json:"title"`
	PrimaryLink      string  `json:"primaryLink"`
	Target           string  `json:"target"`
}

// ImageReport represents the vulnerability state of a single container image.
type ImageReport struct {
	Image             string               `json:"image"`
	Tag               string               `json:"tag"`
	Registry          string               `json:"registry"`
	Summary           VulnerabilitySummary `json:"summary"`
	Fixable           int                  `json:"fixable"`
	LastScanned       string               `json:"lastScanned"`
	ContainerName     string               `json:"containerName"`
	ResourceKind      string               `json:"resourceKind"`
	ResourceName      string               `json:"resourceName"`
	ResourceNamespace string               `json:"resourceNamespace"`
	ReportName        string               `json:"reportName"`
	Vulnerabilities   []Vulnerability      `json:"vulnerabilities,omitempty"`
}

// OverviewRequest is the body for the overview endpoint.
type OverviewRequest struct {
	Namespace string `json:"namespace"`
}

// OverviewResponse is the combined app-level vulnerability summary.
type OverviewResponse struct {
	Summary   VulnerabilitySummary `json:"summary"`
	Fixable   int                  `json:"fixable"`
	Images    []ImageReport        `json:"images"`
	Namespace string               `json:"namespace"`
}
