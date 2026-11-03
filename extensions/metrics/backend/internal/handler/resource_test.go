package handler

import "testing"

func TestFormatValueMatchesDisplayUnit(t *testing.T) {
	cases := []struct {
		val  float64
		unit string
		want string
	}{
		{1500, "millicores", "1500.0"},          // not "1.50" (cores) under a "m" suffix
		{1024 * 1024 * 1024, "bytes", "1024.0"}, // 1 GiB in MiB, not "1.00"
		{500, "bytes/s", "0.5"},                 // KB/s, not bytes
		{3, "count", "3"},
	}
	for _, c := range cases {
		if got := formatValue(c.val, c.unit); got != c.want {
			t.Errorf("formatValue(%v, %q) = %q, want %q (%s)", c.val, c.unit, got, c.want, displayUnit(c.unit))
		}
	}
}
