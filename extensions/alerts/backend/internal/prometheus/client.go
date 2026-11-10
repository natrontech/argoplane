// Package prometheus reads alerting rules and their active alerts from any
// server that speaks the Prometheus rules API: Prometheus, Thanos, Mimir and
// VictoriaMetrics (vmalert) all do.
package prometheus

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// RuleGroup is one group of rules as the rules API returns it. File is the
// rule file the group was loaded from, which for prometheus-operator encodes
// the PrometheusRule it came from.
type RuleGroup struct {
	Name  string `json:"name"`
	File  string `json:"file"`
	Rules []Rule `json:"rules"`
}

// Rule is an alerting rule and its currently active alerts.
type Rule struct {
	Name        string            `json:"name"`
	Query       string            `json:"query"`
	Duration    float64           `json:"duration"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	Alerts      []Alert           `json:"alerts"`
	Health      string            `json:"health"`
	LastError   string            `json:"lastError"`
	State       string            `json:"state"`
	Type        string            `json:"type"`
}

// Alert is one active (pending or firing) instance of a rule.
type Alert struct {
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	State       string            `json:"state"`
	ActiveAt    *time.Time        `json:"activeAt"`
	Value       string            `json:"value"`
}

// Client queries the rules API of a Prometheus-compatible server.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient returns a client for baseURL.
func NewClient(baseURL string) *Client {
	return &Client{baseURL: baseURL, httpClient: &http.Client{Timeout: 10 * time.Second}}
}

// AlertingRules returns every alerting rule group, with each rule's active
// alerts embedded, from one call to /api/v1/rules.
func (c *Client) AlertingRules(ctx context.Context) ([]RuleGroup, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v1/rules?type=alert", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build rules request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query rules: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read rules response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("rules API returned %d", resp.StatusCode)
	}

	var out struct {
		Status string `json:"status"`
		Error  string `json:"error"`
		Data   struct {
			Groups []RuleGroup `json:"groups"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("failed to decode rules response: %w", err)
	}
	if out.Status != "success" {
		return nil, fmt.Errorf("rules API error: %s", out.Error)
	}
	return out.Data.Groups, nil
}
