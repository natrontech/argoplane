package prometheus

import "time"

// Sample represents a single instant query result.
type Sample struct {
	Metric map[string]string
	Value  float64
	Time   time.Time
}

// TimeSeries represents a range query result with multiple data points.
type TimeSeries struct {
	Metric map[string]string
	Values []DataPoint
}

// DataPoint is a single time/value pair.
type DataPoint struct {
	Time  time.Time
	Value float64
}

// apiResponse is the top-level Prometheus API response.
type apiResponse struct {
	Status string   `json:"status"`
	Data   apiData  `json:"data"`
	Error  string   `json:"error,omitempty"`
}

// apiData holds the typed result from Prometheus.
type apiData struct {
	ResultType string          `json:"resultType"`
	Result     []apiResult     `json:"result"`
}

// apiResult represents a single result entry.
type apiResult struct {
	Metric map[string]string `json:"metric"`
	Value  [2]interface{}    `json:"value,omitempty"`  // [timestamp, value] for instant
	Values [][]interface{}   `json:"values,omitempty"` // [[timestamp, value], ...] for range
}
