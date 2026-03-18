package loki

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/natrontech/argoplane/extensions/logs/backend/internal/logql"
)

// Client queries a Loki HTTP API.
type Client struct {
	baseURL    string
	tenantID   string
	httpClient *http.Client
}

// NewClient creates a Loki client for the given base URL.
// If tenantID is non-empty, it is sent as X-Scope-OrgID on every request
// (required when Loki runs in multi-tenant mode).
func NewClient(baseURL, tenantID string) *Client {
	return &Client{
		baseURL:  baseURL,
		tenantID: tenantID,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// QueryRange executes a log query over a time range and returns log entries.
func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, limit int, direction string) ([]LogEntry, *QueryStats, error) {
	params := url.Values{
		"query":     {query},
		"start":     {strconv.FormatInt(start.UnixNano(), 10)},
		"end":       {strconv.FormatInt(end.UnixNano(), 10)},
		"limit":     {strconv.Itoa(limit)},
		"direction": {direction},
	}

	body, err := c.get(ctx, "/loki/api/v1/query_range", params)
	if err != nil {
		return nil, nil, fmt.Errorf("query range: %w", err)
	}

	var resp apiResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, nil, fmt.Errorf("decode response: %w", err)
	}
	if resp.Status != "success" {
		return nil, nil, fmt.Errorf("loki error: %s", resp.Error)
	}

	var entries []LogEntry
	for _, stream := range resp.Data.Result {
		for _, val := range stream.Values {
			if len(val) != 2 {
				continue
			}
			ts, err := parseNanosecondTimestamp(val[0])
			if err != nil {
				continue
			}
			line, ok := val[1].(string)
			if !ok {
				continue
			}
			entries = append(entries, LogEntry{
				Timestamp: ts,
				Line:      line,
				Severity:  logql.DetectSeverity(line),
				Labels:    stream.Stream,
			})
		}
	}

	stats := &QueryStats{
		TotalEntries:   resp.Data.Stats.Summary.TotalEntriesReturned,
		BytesProcessed: resp.Data.Stats.Summary.TotalBytesProcessed,
	}

	return entries, stats, nil
}

// VolumeRange executes a metric query (count_over_time) and returns volume data points.
func (c *Client) VolumeRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]VolumePoint, error) {
	params := url.Values{
		"query": {query},
		"start": {strconv.FormatInt(start.UnixNano(), 10)},
		"end":   {strconv.FormatInt(end.UnixNano(), 10)},
		"step":  {strconv.FormatFloat(step.Seconds(), 'f', 0, 64)},
	}

	body, err := c.get(ctx, "/loki/api/v1/query_range", params)
	if err != nil {
		return nil, fmt.Errorf("volume query: %w", err)
	}

	var resp apiResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if resp.Status != "success" {
		return nil, fmt.Errorf("loki error: %s", resp.Error)
	}

	var points []VolumePoint
	for _, stream := range resp.Data.Result {
		for _, pair := range stream.Values {
			if len(pair) != 2 {
				continue
			}
			t, err := parseNanosecondTimestamp(pair[0])
			if err != nil {
				// Try as float (metric query response format)
				if ts, ok := pair[0].(float64); ok {
					t = time.Unix(int64(ts), int64((ts-float64(int64(ts)))*1e9))
				} else {
					continue
				}
			}
			v, err := parseFloat(pair[1])
			if err != nil {
				continue
			}
			points = append(points, VolumePoint{Time: t, Value: v})
		}
	}

	return points, nil
}

// Labels returns label names available in Loki for a given time range.
func (c *Client) Labels(ctx context.Context, start, end time.Time) ([]string, error) {
	return c.LabelsWithQuery(ctx, "", start, end)
}

// LabelsWithQuery returns label names, optionally scoped by a LogQL stream selector.
func (c *Client) LabelsWithQuery(ctx context.Context, query string, start, end time.Time) ([]string, error) {
	params := url.Values{
		"start": {strconv.FormatInt(start.UnixNano(), 10)},
		"end":   {strconv.FormatInt(end.UnixNano(), 10)},
	}
	if query != "" {
		params.Set("query", query)
	}

	body, err := c.get(ctx, "/loki/api/v1/labels", params)
	if err != nil {
		return nil, fmt.Errorf("labels: %w", err)
	}

	var resp labelsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode labels: %w", err)
	}
	return resp.Data, nil
}

// LabelValues returns values for a specific label, optionally filtered by a LogQL query.
func (c *Client) LabelValues(ctx context.Context, name string, query string, start, end time.Time) ([]string, error) {
	params := url.Values{
		"start": {strconv.FormatInt(start.UnixNano(), 10)},
		"end":   {strconv.FormatInt(end.UnixNano(), 10)},
	}
	if query != "" {
		params.Set("query", query)
	}

	path := fmt.Sprintf("/loki/api/v1/label/%s/values", url.PathEscape(name))
	body, err := c.get(ctx, path, params)
	if err != nil {
		return nil, fmt.Errorf("label values: %w", err)
	}

	var resp labelsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode label values: %w", err)
	}
	return resp.Data, nil
}

func (c *Client) get(ctx context.Context, path string, params url.Values) ([]byte, error) {
	u := fmt.Sprintf("%s%s?%s", c.baseURL, path, params.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	if c.tenantID != "" {
		req.Header.Set("X-Scope-OrgID", c.tenantID)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki returned %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

func parseNanosecondTimestamp(v interface{}) (time.Time, error) {
	s, ok := v.(string)
	if !ok {
		return time.Time{}, fmt.Errorf("expected string timestamp, got %T", v)
	}
	ns, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse nanosecond timestamp: %w", err)
	}
	return time.Unix(0, ns), nil
}

func parseFloat(v interface{}) (float64, error) {
	switch val := v.(type) {
	case string:
		return strconv.ParseFloat(val, 64)
	case float64:
		return val, nil
	default:
		return 0, fmt.Errorf("unexpected value type: %T", v)
	}
}
