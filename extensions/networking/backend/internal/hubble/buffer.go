package hubble

import (
	"cmp"
	"context"
	"fmt"
	"log/slog"
	"slices"
	"sync"
	"time"
)

// flowKey uniquely identifies a flow for deduplication.
func flowKey(f FlowSummary) string {
	return f.Time + "|" + f.Verdict + "|" + f.Direction + "|" +
		f.SourceNamespace + "/" + f.SourcePod + "|" +
		f.DestNamespace + "/" + f.DestPod + "|" +
		f.Protocol + "|" + f.DestIP + "|" +
		fmt.Sprintf("%d", f.DestPort)
}

// FlowBuffer accumulates flows across requests per namespace, deduplicating
// and pruning entries older than the configured retention period. This solves
// the problem of Hubble's ring buffer losing short-lived flows between UI
// refresh intervals.
type FlowBuffer struct {
	client    *Client
	mu        sync.Mutex
	flows     map[string]map[string]FlowSummary // namespace -> flowKey -> flow
	retention time.Duration
	maxPerNs  int
}

// NewFlowBuffer creates a buffer that retains flows for the given duration.
// If client is nil, the buffer operates in pass-through mode (returns empty).
func NewFlowBuffer(client *Client, retention time.Duration, maxPerNamespace int) *FlowBuffer {
	if retention <= 0 {
		retention = 15 * time.Minute
	}
	if maxPerNamespace <= 0 {
		maxPerNamespace = 5000
	}
	return &FlowBuffer{
		client:    client,
		flows:     make(map[string]map[string]FlowSummary),
		retention: retention,
		maxPerNs:  maxPerNamespace,
	}
}

// Flows queries Hubble for recent flows, merges them into the buffer, prunes
// old entries, and returns the buffered flows within the requested time window.
func (b *FlowBuffer) Flows(ctx context.Context, req FlowsRequest) ([]FlowSummary, error) {
	if b.client == nil {
		return nil, nil
	}

	// Always fetch the full retention window from Hubble to maximize what we
	// capture, regardless of the UI's requested time range.
	hubbleReq := req
	if hubbleReq.Since < b.retention {
		hubbleReq.Since = b.retention
	}
	// Request more flows from Hubble than the UI limit to fill the buffer.
	if hubbleReq.Limit < 1000 {
		hubbleReq.Limit = 1000
	}
	// Don't filter by verdict/direction at the Hubble level; we want all
	// flows in the buffer and filter when serving.
	hubbleReq.Verdict = "all"
	hubbleReq.Direction = "all"

	fresh, err := b.client.Flows(ctx, hubbleReq)
	if err != nil {
		slog.Warn("hubble query failed, serving from buffer", "error", err, "namespace", req.Namespace)
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	nsFlows, ok := b.flows[req.Namespace]
	if !ok {
		nsFlows = make(map[string]FlowSummary)
		b.flows[req.Namespace] = nsFlows
	}

	// Merge fresh flows into buffer.
	for _, f := range fresh {
		nsFlows[flowKey(f)] = f
	}

	// Prune every namespace, not just this one: a namespace viewed once would
	// otherwise keep up to maxPerNs flows for the life of the process.
	cutoff := time.Now().Add(-b.retention).UTC().Format(timeFormat)
	for ns, m := range b.flows {
		for key, f := range m {
			if f.Time < cutoff {
				delete(m, key)
			}
		}
		if len(m) == 0 {
			delete(b.flows, ns)
		}
	}

	// If buffer exceeds max, keep only the newest entries.
	if len(nsFlows) > b.maxPerNs {
		evictOldest(nsFlows, b.maxPerNs)
	}

	// Build result: filter to the requested time window and apply filters.
	// The caller applies req.Limit after counting, so summaries cover the
	// whole window.
	windowCutoff := time.Now().Add(-req.Since).UTC().Format(timeFormat)
	result := make([]FlowSummary, 0, len(nsFlows))
	for _, f := range nsFlows {
		if f.Time < windowCutoff {
			continue
		}
		if !matchesVerdictFilter(f, req.Verdict) || !matchesDirectionFilter(f, req.Direction) {
			continue
		}
		if req.Pods != nil && !req.Pods[f.SourcePod] && !req.Pods[f.DestPod] {
			continue
		}
		result = append(result, f)
	}

	// Newest first. Times are fixed-width UTC, so string order is time order.
	slices.SortFunc(result, func(a, b FlowSummary) int {
		return cmp.Compare(b.Time, a.Time)
	})

	return result, nil
}

// evictOldest removes the oldest entries until the map is within maxSize.
func evictOldest(nsFlows map[string]FlowSummary, maxSize int) {
	type entry struct {
		key  string
		time string
	}
	entries := make([]entry, 0, len(nsFlows))
	for key, f := range nsFlows {
		entries = append(entries, entry{key: key, time: f.Time})
	}
	slices.SortFunc(entries, func(a, b entry) int {
		return cmp.Compare(a.time, b.time) // oldest first
	})
	toRemove := len(entries) - maxSize
	for i := 0; i < toRemove; i++ {
		delete(nsFlows, entries[i].key)
	}
}

func matchesVerdictFilter(f FlowSummary, verdict string) bool {
	if verdict == "" || verdict == "all" {
		return true
	}
	switch verdict {
	case "forwarded":
		return f.Verdict == "FORWARDED"
	case "dropped":
		return f.Verdict == "DROPPED"
	case "error":
		return f.Verdict == "ERROR"
	}
	return true
}

func matchesDirectionFilter(f FlowSummary, direction string) bool {
	if direction == "" || direction == "all" {
		return true
	}
	switch direction {
	case "ingress":
		return f.Direction == "INGRESS"
	case "egress":
		return f.Direction == "EGRESS"
	}
	return true
}
