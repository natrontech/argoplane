package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
)

// WriteJSON encodes data as JSON and writes it to the response.
func WriteJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Error("failed to encode response", "error", err)
	}
}

// WriteError writes a JSON error response.
func WriteError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":%q}`, msg)
}

// invalidLabelChars matches characters not allowed in Kubernetes label values.
var invalidLabelChars = regexp.MustCompile(`[^a-zA-Z0-9\-_.]`)

// sanitizeLabelValue converts a string (e.g. email) into a valid Kubernetes label value.
// Label values must match: (([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?
// Max 63 characters.
func sanitizeLabelValue(s string) string {
	s = strings.ReplaceAll(s, "@", "_at_")
	s = invalidLabelChars.ReplaceAllString(s, "_")
	// Trim leading/trailing non-alphanumeric characters
	s = strings.TrimLeft(s, "-_.")
	s = strings.TrimRight(s, "-_.")
	if len(s) > 63 {
		s = s[:63]
		s = strings.TrimRight(s, "-_.")
	}
	return s
}
