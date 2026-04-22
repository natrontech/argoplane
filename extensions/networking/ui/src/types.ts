export interface PolicyRule {
  peers: string[];
  ports: string[];
}

export interface PolicySummary {
  name: string;
  namespace?: string;
  description?: string;
  endpointSelector?: Record<string, string>;
  hasIngress: boolean;
  hasEgress: boolean;
  ingressRuleCount: number;
  egressRuleCount: number;
  ingressRules?: PolicyRule[];
  egressRules?: PolicyRule[];
  labels?: Record<string, string>;
  creationTimestamp: string;
  ownership: 'app' | 'platform';
  scope: 'namespace' | 'clusterwide';
}

export interface EndpointSummary {
  name: string;
  namespace: string;
  endpointId: number;
  identityId: number;
  ipv4?: string;
  ipv6?: string;
  ingressEnforcement: string;
  egressEnforcement: string;
  state: string;
  labels?: Record<string, string>;
  namedPorts?: Array<{ name: string; port: number; protocol: string }>;
}

export interface FlowSummary {
  time: string;
  verdict: string;
  direction: string;
  sourceNamespace: string;
  sourcePod: string;
  sourceIP?: string;
  destNamespace: string;
  destPod: string;
  destIP?: string;
  destDNS?: string;
  protocol: string;
  destPort: number;
  dropReason?: string;
  summary: string;
  isReply: boolean;
}

export interface FlowsResponse {
  flows: FlowSummary[];
  hubble: boolean;
  message?: string;
  summary?: {
    total: number;
    forwarded: number;
    dropped: number;
    error: number;
  };
}

export interface ResourceRef {
  group: string;
  kind: string;
  namespace: string;
  name: string;
}

export type VerdictFilter = 'all' | 'forwarded' | 'dropped' | 'error';
export type DirectionFilter = 'all' | 'ingress' | 'egress';
export type TimeRange = '5m' | '15m' | '1h';

// ─── Service Map ────────────────────────────────────────────────────────────

export interface ServiceMapNode {
  id: string;
  label: string;
  kind: 'workload' | 'external' | 'world';
  namespace?: string;
  pods?: string[];
}

export interface ServiceMapEdge {
  id: string;
  source: string;
  target: string;
  protocol: string;
  port: number;
  forwarded: number;
  dropped: number;
  verdict: 'forwarded' | 'dropped' | 'mixed';
}

export interface ServiceMapResponse {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  hubble: boolean;
}
