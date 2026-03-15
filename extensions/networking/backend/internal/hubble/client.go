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

// FlowSummary is a simplified flow record suitable for JSON serialization.
type FlowSummary struct {
	Time            string `json:"time"`
	Verdict         string `json:"verdict"`
	Direction       string `json:"direction"`
	SourceNamespace string `json:"sourceNamespace"`
	SourcePod       string `json:"sourcePod"`
	SourceIP        string `json:"sourceIP,omitempty"`
	DestNamespace   string `json:"destNamespace"`
	DestPod         string `json:"destPod"`
	DestIP          string `json:"destIP,omitempty"`
	DestDNS         string `json:"destDNS,omitempty"`
	Protocol        string `json:"protocol"`
	DestPort        uint32 `json:"destPort"`
	DropReason      string `json:"dropReason,omitempty"`
	Summary         string `json:"summary"`
	IsReply         bool   `json:"isReply"`
}

// FlowsRequest contains parameters for querying flows.
type FlowsRequest struct {
	Namespace string
	Since     time.Duration
	Limit     int64
	Verdict   string // "all", "forwarded", "dropped", "error"
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
			fs.Time = t.AsTime().Format(time.RFC3339)
		}

		if flow.GetIsReply() != nil {
			fs.IsReply = flow.GetIsReply().GetValue()
		}

		if src := flow.GetSource(); src != nil {
			fs.SourceNamespace = src.GetNamespace()
			fs.SourcePod = src.GetPodName()
		}
		if srcIP := flow.GetIP(); srcIP != nil {
			fs.SourceIP = srcIP.GetSource()
			fs.DestIP = srcIP.GetDestination()
		}

		if dst := flow.GetDestination(); dst != nil {
			fs.DestNamespace = dst.GetNamespace()
			fs.DestPod = dst.GetPodName()
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

		flows = append(flows, fs)
	}

	return flows, nil
}
