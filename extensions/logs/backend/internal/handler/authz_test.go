package handler

import (
	"reflect"
	"testing"
)

func TestParseClusterConfig(t *testing.T) {
	tests := []struct {
		name    string
		label   string
		mapJSON string
		want    map[string]string
		wantErr bool
	}{
		{name: "off", want: map[string]string{}},
		{name: "label only", label: "cluster", want: map[string]string{}},
		{name: "underscore label", label: "_k8s_cluster", want: map[string]string{}},
		{name: "dash in label", label: "cluster-name", wantErr: true},
		{name: "leading digit", label: "1abc", wantErr: true},
		{name: "quote in label", label: `c"}`, wantErr: true},
		{name: "bad json", label: "cluster", mapJSON: "{bad", wantErr: true},
		{name: "non-string value", label: "cluster", mapJSON: `{"a":1}`, wantErr: true},
		{name: "newline value", label: "cluster", mapJSON: `{"a":"x\ny"}`, wantErr: true},
		{
			name:    "valid map, trailing slash trimmed",
			label:   "cluster",
			mapJSON: `{"in-cluster":"","https://10.0.0.1:6443/":"prod"}`,
			want:    map[string]string{"in-cluster": "", "https://10.0.0.1:6443": "prod"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseClusterConfig(tt.label, tt.mapJSON)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseClusterConfig(%q, %q) error = %v, wantErr %v", tt.label, tt.mapJSON, err, tt.wantErr)
			}
			if !tt.wantErr && !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ParseClusterConfig(%q, %q) = %v, want %v", tt.label, tt.mapJSON, got, tt.want)
			}
		})
	}
}

func TestResolveCluster(t *testing.T) {
	app := func(name, server string) map[string]interface{} {
		dest := map[string]interface{}{}
		if name != "" {
			dest["name"] = name
		}
		if server != "" {
			dest["server"] = server
		}
		return map[string]interface{}{"spec": map[string]interface{}{"destination": dest}}
	}
	m := map[string]string{
		"in-cluster":             "",
		"https://10.0.0.1:6443":  "prod",
		"staging":                "stage-eu",
		"https://shadowed:6443":  "unused",
		"https://kubernetes.svc": "hub",
	}

	tests := []struct {
		name  string
		label string
		app   map[string]interface{}
		noMap bool
		want  string
	}{
		{name: "filter off", label: "", app: app("staging", ""), want: ""},
		{name: "name only, no map hit", label: "cluster", app: app("dev", ""), want: "dev"},
		{name: "name mapped", label: "cluster", app: app("staging", ""), want: "stage-eu"},
		{name: "server only, mapped", label: "cluster", app: app("", "https://10.0.0.1:6443"), want: "prod"},
		{name: "server trailing slash", label: "cluster", app: app("", "https://10.0.0.1:6443/"), want: "prod"},
		{name: "server only, no map hit", label: "cluster", app: app("", "https://other:6443"), want: ""},
		{name: "name wins over server", label: "cluster", app: app("staging", "https://shadowed:6443"), want: "stage-eu"},
		{name: "name miss falls to server", label: "cluster", app: app("dev", "https://10.0.0.1:6443"), want: "prod"},
		{name: "in-cluster mapped to no filter", label: "cluster", app: app("in-cluster", ""), want: ""},
		{name: "in-cluster unmapped", label: "cluster", app: app("in-cluster", "https://kubernetes.default.svc"), noMap: true, want: "in-cluster"},
		{name: "default server unmapped", label: "cluster", app: app("", "https://kubernetes.default.svc"), want: ""},
		{name: "no destination", label: "cluster", app: map[string]interface{}{}, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mm := m
			if tt.noMap {
				mm = nil
			}
			a := NewAuthorizer(nil, tt.label, mm)
			if got := a.resolveCluster(tt.app); got != tt.want {
				t.Errorf("resolveCluster() = %q, want %q", got, tt.want)
			}
		})
	}
}
