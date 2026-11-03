package hubble

import (
	"context"
	"errors"
	"testing"
	"time"

	observerpb "github.com/cilium/cilium/api/v1/observer"
	"google.golang.org/grpc"
)

// downObserver simulates an unreachable Hubble Relay so the buffer serves
// only what it already holds.
type downObserver struct{ observerpb.ObserverClient }

func (downObserver) GetFlows(context.Context, *observerpb.GetFlowsRequest, ...grpc.CallOption) (grpc.ServerStreamingClient[observerpb.GetFlowsResponse], error) {
	return nil, errors.New("relay down")
}

func at(d time.Duration) string { return time.Now().Add(-d).UTC().Format(timeFormat) }

func TestFlowBuffer(t *testing.T) {
	b := NewFlowBuffer(&Client{observer: downObserver{}}, 15*time.Minute, 5000)
	b.flows = map[string]map[string]FlowSummary{
		"app": {
			"busy-new":  {Time: at(1 * time.Second), SourcePod: "busy"},
			"busy-old":  {Time: at(2 * time.Second), SourcePod: "busy"},
			"quiet":     {Time: at(3 * time.Second), DestPod: "quiet"},
			"whole-sec": {Time: at(0), SourcePod: "busy"},
		},
		"stale": {"old": {Time: at(time.Hour), SourcePod: "x"}},
	}

	got, err := b.Flows(context.Background(), FlowsRequest{Namespace: "app", Since: 5 * time.Minute, Limit: 1, Pods: map[string]bool{"quiet": true}})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].DestPod != "quiet" {
		t.Errorf("pod filter must run before the limit, got %+v", got)
	}

	if _, ok := b.flows["stale"]; ok {
		t.Error("expired flows of other namespaces must be pruned")
	}

	all, _ := b.Flows(context.Background(), FlowsRequest{Namespace: "app", Since: 5 * time.Minute})
	for i := 1; i < len(all); i++ {
		if all[i-1].Time < all[i].Time {
			t.Errorf("flows not sorted newest first: %s before %s", all[i-1].Time, all[i].Time)
		}
	}
}
