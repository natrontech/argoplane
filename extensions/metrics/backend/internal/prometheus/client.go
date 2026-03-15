package prometheus

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// Client queries a Prometheus HTTP API.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a Prometheus client for the given base URL.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Query executes an instant query and returns samples.
func (c *Client) Query(ctx context.Context, query string) ([]Sample, error) {
	params := url.Values{
		"query": {query},
		"time":  {strconv.FormatInt(time.Now().Unix(), 10)},
	}

	body, err := c.get(ctx, "/api/v1/query", params)
	if err != nil {
		return nil, fmt.Errorf("instant query: %w", err)
	}

	var resp apiResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if resp.Status != "success" {
		return nil, fmt.Errorf("prometheus error: %s", resp.Error)
	}

	var samples []Sample
	for _, r := range resp.Data.Result {
		val, err := parseFloat(r.Value[1])
		if err != nil {
			continue
		}
		ts, _ := parseTimestamp(r.Value[0])
		samples = append(samples, Sample{
			Metric: r.Metric,
			Value:  val,
			Time:   ts,
		})
	}
	return samples, nil
}

// QueryRange executes a range query and returns time series.
func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]TimeSeries, error) {
	params := url.Values{
		"query": {query},
		"start": {strconv.FormatInt(start.Unix(), 10)},
		"end":   {strconv.FormatInt(end.Unix(), 10)},
		"step":  {strconv.FormatFloat(step.Seconds(), 'f', 0, 64)},
	}

	body, err := c.get(ctx, "/api/v1/query_range", params)
	if err != nil {
		return nil, fmt.Errorf("range query: %w", err)
	}

	var resp apiResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if resp.Status != "success" {
		return nil, fmt.Errorf("prometheus error: %s", resp.Error)
	}

	var series []TimeSeries
	for _, r := range resp.Data.Result {
		ts := TimeSeries{Metric: r.Metric}
		for _, pair := range r.Values {
			if len(pair) != 2 {
				continue
			}
			t, _ := parseTimestamp(pair[0])
			v, err := parseFloat(pair[1])
			if err != nil {
				continue
			}
			ts.Values = append(ts.Values, DataPoint{Time: t, Value: v})
		}
		series = append(series, ts)
	}
	return series, nil
}

// MetricNames returns metric names matching an optional namespace filter.
func (c *Client) MetricNames(ctx context.Context, namespace string) ([]string, error) {
	// Use series endpoint to find metrics present for a namespace
	params := url.Values{}
	if namespace != "" {
		params.Set("match[]", fmt.Sprintf(`{namespace="%s"}`, namespace))
	} else {
		params.Set("match[]", `{__name__!=""}`)
	}

	body, err := c.get(ctx, "/api/v1/label/__name__/values", params)
	if err != nil {
		return nil, fmt.Errorf("metric names: %w", err)
	}

	var resp struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode metric names: %w", err)
	}
	return resp.Data, nil
}

func (c *Client) get(ctx context.Context, path string, params url.Values) ([]byte, error) {
	u := fmt.Sprintf("%s%s?%s", c.baseURL, path, params.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
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
		return nil, fmt.Errorf("prometheus returned %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
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

func parseTimestamp(v interface{}) (time.Time, error) {
	switch val := v.(type) {
	case float64:
		sec := int64(val)
		nsec := int64((val - float64(sec)) * 1e9)
		return time.Unix(sec, nsec), nil
	default:
		return time.Time{}, fmt.Errorf("unexpected timestamp type: %T", v)
	}
}
