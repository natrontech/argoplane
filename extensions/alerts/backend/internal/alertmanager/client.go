// Package alertmanager reads which alerts are silenced or inhibited. It is
// optional: without it every alert is reported as not suppressed.
package alertmanager

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Alert is the part of an Alertmanager v2 alert this backend uses.
type Alert struct {
	Labels map[string]string `json:"labels"`
	Status struct {
		State       string   `json:"state"`
		SilencedBy  []string `json:"silencedBy"`
		InhibitedBy []string `json:"inhibitedBy"`
	} `json:"status"`
}

// Client queries the Alertmanager v2 API.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient returns a client for baseURL.
func NewClient(baseURL string) *Client {
	return &Client{baseURL: baseURL, httpClient: &http.Client{Timeout: 10 * time.Second}}
}

// Alerts returns every active alert, including silenced and inhibited ones.
func (c *Client) Alerts(ctx context.Context) ([]Alert, error) {
	u := c.baseURL + "/api/v2/alerts?active=true&silenced=true&inhibited=true&unprocessed=false"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build alertmanager request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query alertmanager: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read alertmanager response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("alertmanager returned %d", resp.StatusCode)
	}

	var alerts []Alert
	if err := json.Unmarshal(body, &alerts); err != nil {
		return nil, fmt.Errorf("failed to decode alertmanager response: %w", err)
	}
	return alerts, nil
}
