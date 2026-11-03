package hubble

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	flowpb "github.com/cilium/cilium/api/v1/flow"
	observerpb "github.com/cilium/cilium/api/v1/observer"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Client connects to Hubble Relay via gRPC to query network flows.
type Client struct {
	conn     *grpc.ClientConn
	observer observerpb.ObserverClient
}

// NewClient creates a new Hubble Relay gRPC client.
func NewClient(relayURL string) (*Client, error) {
	conn, err := grpc.NewClient(relayURL, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to hubble relay at %s: %w", relayURL, err)
	}
	return &Client{
		conn:     conn,
		observer: observerpb.NewObserverClient(conn),
	}, nil
}

// Close closes the gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

// timeFormat is RFC 3339 with a fixed nine-digit fraction. time.RFC3339Nano
// trims trailing zeros, which breaks lexical sorting.
const timeFormat = "2006-01-02T15:04:05.000000000Z07:00"

// FlowSummary is a simplified flow record suitable for JSON serialization.
type FlowSummary struct {
	Time            string `json:"time"`
	Verdict         string `json:"verdict"`
	Direction       string `json:"direction"`
	SourceNamespace string `json:"sourceNamespace"`
	SourcePod       string `json:"sourcePod"`
	SourceIP        string `json:"sourceIP,omitempty"`
	SourceWorkload  string `json:"sourceWorkload,omitempty"`
	SourceIdentity  string `json:"sourceIdentity,omitempty"`
	DestNamespace   string `json:"destNamespace"`
	DestPod         string `json:"destPod"`
	DestIP          string `json:"destIP,omitempty"`
	DestDNS         string `json:"destDNS,omitempty"`
	DestWorkload    string `json:"destWorkload,omitempty"`
	DestIdentity    string `json:"destIdentity,omitempty"`
	Protocol        string `json:"protocol"`
	DestPort        uint32 `json:"destPort"`
	DropReason      string `json:"dropReason,omitempty"`
	Summary         string `json:"summary"`
	IsReply         bool   `json:"isReply"`
	// Policies Cilium reports as having allowed or denied this flow.
	AllowedBy []string `json:"allowedBy,omitempty"`
	DeniedBy  []string `json:"deniedBy,omitempty"`
}

// FlowsRequest contains parameters for querying flows.
type FlowsRequest struct {
	Namespace string
	Since     time.Duration
	Limit     int64
	Verdict   string // "all", "forwarded", "dropped", "error"
	Direction string // "all", "ingress", "egress"
	// Pods, when set, keeps only flows whose source or destination pod is in
	// the set. Applied before Limit so quiet pods aren't crowded out.
	Pods map[string]bool
}

// Flows queries Hubble Relay for recent flows matching the request filters.
func (c *Client) Flows(ctx context.Context, req FlowsRequest) ([]FlowSummary, error) {
	if req.Limit <= 0 {
		req.Limit = 100
	}
	if req.Since <= 0 {
		req.Since = 5 * time.Minute
	}

	sinceTime := timestamppb.New(time.Now().Add(-req.Since))

	// Build whitelist: flows where source OR destination is in the namespace.
	whitelist := []*flowpb.FlowFilter{
		{SourcePod: []string{req.Namespace + "/"}},
		{DestinationPod: []string{req.Namespace + "/"}},
	}

	// Apply verdict filter to each whitelist entry.
	if req.Verdict != "" && req.Verdict != "all" {
		var verdicts []flowpb.Verdict
		switch strings.ToLower(req.Verdict) {
		case "forwarded":
			verdicts = []flowpb.Verdict{flowpb.Verdict_FORWARDED}
		case "dropped":
			verdicts = []flowpb.Verdict{flowpb.Verdict_DROPPED}
		case "error":
			verdicts = []flowpb.Verdict{flowpb.Verdict_ERROR}
		}
		if len(verdicts) > 0 {
			for _, f := range whitelist {
				f.Verdict = verdicts
			}
		}
	}

	// Apply direction filter to each whitelist entry.
	if req.Direction != "" && req.Direction != "all" {
		var directions []flowpb.TrafficDirection
		switch strings.ToLower(req.Direction) {
		case "ingress":
			directions = []flowpb.TrafficDirection{flowpb.TrafficDirection_INGRESS}
		case "egress":
			directions = []flowpb.TrafficDirection{flowpb.TrafficDirection_EGRESS}
		}
		if len(directions) > 0 {
			for _, f := range whitelist {
				f.TcpFlags = nil // clear any conflicting fields
				f.TrafficDirection = directions
			}
		}
	}

	grpcReq := &observerpb.GetFlowsRequest{
		Number:    uint64(req.Limit),
		Since:     sinceTime,
		Whitelist: whitelist,
	}

	stream, err := c.observer.GetFlows(ctx, grpcReq)
	if err != nil {
		return nil, fmt.Errorf("failed to get flows: %w", err)
	}

	var flows []FlowSummary
	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Return what we collected so far on stream errors.
			if len(flows) > 0 {
				return flows, nil
			}
			return nil, fmt.Errorf("failed to receive flow: %w", err)
		}

		flow := resp.GetFlow()
		if flow == nil {
			continue
		}

		fs := FlowSummary{
			Verdict:   flow.GetVerdict().String(),
			Direction: flow.GetTrafficDirection().String(),
			Summary:   flow.GetSummary(),
		}

		if t := flow.GetTime(); t != nil {
			// Fixed-width UTC nanoseconds: distinct flows within one second keep
			// distinct dedup keys, and string order equals time order.
			fs.Time = t.AsTime().UTC().Format(timeFormat)
		}

		if flow.GetIsReply() != nil {
			fs.IsReply = flow.GetIsReply().GetValue()
		}

		if src := flow.GetSource(); src != nil {
			fs.SourceNamespace = src.GetNamespace()
			fs.SourcePod = src.GetPodName()
			fs.SourceWorkload = workloadName(src)
			fs.SourceIdentity = reservedIdentity(src)
		}
		if srcIP := flow.GetIP(); srcIP != nil {
			fs.SourceIP = srcIP.GetSource()
			fs.DestIP = srcIP.GetDestination()
		}

		if dst := flow.GetDestination(); dst != nil {
			fs.DestNamespace = dst.GetNamespace()
			fs.DestPod = dst.GetPodName()
			fs.DestWorkload = workloadName(dst)
			fs.DestIdentity = reservedIdentity(dst)
		}

		if dns := flow.GetDestinationNames(); len(dns) > 0 {
			fs.DestDNS = dns[0]
		}

		if l4 := flow.GetL4(); l4 != nil {
			switch {
			case l4.GetTCP() != nil:
				fs.Protocol = "TCP"
				fs.DestPort = l4.GetTCP().GetDestinationPort()
			case l4.GetUDP() != nil:
				fs.Protocol = "UDP"
				fs.DestPort = l4.GetUDP().GetDestinationPort()
			case l4.GetICMPv4() != nil:
				fs.Protocol = "ICMPv4"
			case l4.GetICMPv6() != nil:
				fs.Protocol = "ICMPv6"
			case l4.GetSCTP() != nil:
				fs.Protocol = "SCTP"
				fs.DestPort = l4.GetSCTP().GetDestinationPort()
			}
		}

		if flow.GetVerdict() == flowpb.Verdict_DROPPED {
			fs.DropReason = flow.GetDropReasonDesc().String()
		}

		fs.AllowedBy = policyNames(flow.GetIngressAllowedBy(), flow.GetEgressAllowedBy())
		fs.DeniedBy = policyNames(flow.GetIngressDeniedBy(), flow.GetEgressDeniedBy())

		flows = append(flows, fs)
	}

	return flows, nil
}

// workloadName returns the name of the endpoint's owning workload (e.g. the
// Deployment), or "" when Hubble did not resolve one.
func workloadName(ep *flowpb.Endpoint) string {
	if w := ep.GetWorkloads(); len(w) > 0 {
		return w[0].GetName()
	}
	return ""
}

// reservedIdentity returns the Cilium reserved identity of an endpoint
// ("world", "host", "kube-apiserver", ...), or "" for regular endpoints.
func reservedIdentity(ep *flowpb.Endpoint) string {
	for _, l := range ep.GetLabels() {
		if name, ok := strings.CutPrefix(l, "reserved:"); ok {
			return name
		}
	}
	return ""
}

// policyNames flattens Hubble policy references into "namespace/name"
// (or "name" for clusterwide policies).
func policyNames(lists ...[]*flowpb.Policy) []string {
	var names []string
	for _, list := range lists {
		for _, p := range list {
			name := p.GetName()
			if ns := p.GetNamespace(); ns != "" {
				name = ns + "/" + name
			}
			names = append(names, name)
		}
	}
	return names
}
