package config

import (
	"encoding/json"
	"fmt"
	"os"
)

// DashboardConfig is the top-level config loaded from a JSON file (ConfigMap).
type DashboardConfig struct {
	Applications []Application `json:"applications"`
}

// Application scopes dashboards to a named ArgoCD application (or "default" as fallback).
type Application struct {
	Name       string       `json:"name"`
	Default    bool         `json:"default"`
	Dashboards []*Dashboard `json:"dashboards"`
}

// Dashboard groups metrics for a specific Kubernetes resource kind.
type Dashboard struct {
	GroupKind string   `json:"groupKind"` // "deployment", "statefulset", "pod"
	Tabs      []string `json:"tabs"`
	Intervals []string `json:"intervals"` // e.g. ["1h", "6h", "24h", "7d"]
	Rows      []*Row   `json:"rows"`
}

// Row is a horizontal group of graphs displayed together.
type Row struct {
	Name   string   `json:"name"`  // URL-safe identifier
	Title  string   `json:"title"` // Display title
	Tab    string   `json:"tab"`   // Which tab this row appears under (empty = default tab)
	Graphs []*Graph `json:"graphs"`
}

// Graph defines a single chart and its PromQL query.
type Graph struct {
	Name            string      `json:"name"`            // URL-safe identifier
	Title           string      `json:"title"`           // Display title
	Description     string      `json:"description"`     // Tooltip on Y-axis
	GraphType       string      `json:"graphType"`       // "line" (default), "area"
	MetricName      string      `json:"metricName"`      // Prometheus label to group by (e.g. "pod", "container")
	QueryExpression string      `json:"queryExpression"` // PromQL with Go template vars
	YAxisUnit       string      `json:"yAxisUnit"`       // Display unit (e.g. "millicores", "MiB", "KB/s")
	Thresholds      []Threshold `json:"thresholds,omitempty"`
}

// Threshold renders a reference line on the chart.
type Threshold struct {
	Name            string `json:"name"`
	Color           string `json:"color"`
	Value           string `json:"value"`           // Static value (used if queryExpression is empty)
	QueryExpression string `json:"queryExpression"` // Dynamic threshold via PromQL
}

// Load reads and parses a dashboard config from a JSON file.
func Load(path string) (*DashboardConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg DashboardConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	return &cfg, nil
}

// App finds the application config by name, falling back to the default.
func (c *DashboardConfig) App(name string) *Application {
	var fallback *Application
	for i := range c.Applications {
		if c.Applications[i].Name == name {
			return &c.Applications[i]
		}
		if c.Applications[i].Default {
			fallback = &c.Applications[i]
		}
	}
	return fallback
}

// DashboardFor finds the dashboard for a given groupKind within an application.
func (a *Application) DashboardFor(groupKind string) *Dashboard {
	for _, d := range a.Dashboards {
		if d.GroupKind == groupKind {
			return d
		}
	}
	return nil
}

// FindRow finds a row by name within a dashboard.
func (d *Dashboard) FindRow(name string) *Row {
	for _, r := range d.Rows {
		if r.Name == name {
			return r
		}
	}
	return nil
}

// FindGraph finds a graph by name within a row.
func (r *Row) FindGraph(name string) *Graph {
	for _, g := range r.Graphs {
		if g.Name == name {
			return g
		}
	}
	return nil
}
