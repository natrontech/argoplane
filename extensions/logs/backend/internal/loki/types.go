package loki

import "time"

// LogEntry represents a single log line with metadata.
type LogEntry struct {
	Timestamp time.Time         `json:"timestamp"`
	Line      string            `json:"line"`
	Severity  string            `json:"severity"`
	Labels    map[string]string `json:"labels"`
}

// QueryStats contains metadata about a log query.
type QueryStats struct {
	TotalEntries   int `json:"totalEntries"`
	BytesProcessed int `json:"bytesProcessed"`
}

// VolumePoint represents a single data point in a log volume time series.
type VolumePoint struct {
	Time  time.Time `json:"time"`
	Value float64   `json:"value"`
}

// apiResponse is the top-level Loki API response structure.
type apiResponse struct {
	Status string   `json:"status"`
	Data   apiData  `json:"data"`
	Error  string   `json:"error,omitempty"`
}

type apiData struct {
	ResultType string      `json:"resultType"`
	Result     []apiStream `json:"result"`
	Stats      apiStats    `json:"stats,omitempty"`
}

// apiStream represents a log stream result from Loki.
// For streams resultType, Values contains [[nanosecond_timestamp_string, line], ...].
// For matrix resultType (metric queries), the same field is used but values are numeric.
type apiStream struct {
	Stream map[string]string `json:"stream"`
	Values [][]interface{}   `json:"values"`
	Metric map[string]string `json:"metric,omitempty"`
}

type apiStats struct {
	Summary apiStatsSummary `json:"summary"`
}

type apiStatsSummary struct {
	BytesProcessedPerSecond int `json:"bytesProcessedPerSecond"`
	TotalBytesProcessed     int `json:"totalBytesProcessed"`
	TotalEntriesReturned    int `json:"totalEntriesReturned"`
}

// labelsResponse is the Loki labels API response.
type labelsResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
}
