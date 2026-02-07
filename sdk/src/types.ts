/**
 * Types for ERC8001 Agent Task SDK
 */

/** Task status enum - matches IAgentTaskEscrow.TaskStatus */
export enum TaskStatus {
  None = 0,
  Created = 1,
  Accepted = 2,
  ResultAsserted = 3,
  DisputedAwaitingAgent = 4,
  EscalatedToUMA = 5,
  TimeoutCancelled = 6,
  AgentFailed = 7,
  Resolved = 8,
}

/** On-chain Task struct */
export interface Task {
  id: bigint;
  client: string;
  agent: string;
  paymentToken: string;
  paymentAmount: bigint;
  agentStake: bigint;
  createdAt: bigint;
  deadline: bigint;
  cooldownEndsAt: bigint;
  status: TaskStatus;
  resultHash: string;
  agentSignature: string;
  clientDisputeBond: bigint;
  agentEscalationBond: bigint;
  clientEvidenceURI: string;
  agentEvidenceURI: string;
  resultURI: string;
  umaAssertionId: string;
  umaResultTruth: boolean;
}

/** Agent capability card from market maker */
export interface AgentCapabilityCard {
  agentId: string;
  capabilityId?: string;
  name: string;
  description: string;
  supportedDomains?: string[];
  maxConcurrentTasks?: number;
  url?: string;
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    tags?: string[];
  }>;
  sla?: {
    minAcceptanceStake: string;
    avgCompletionTimeSeconds: number;
    maxCompletionTimeSeconds: number;
  };
  endpoints?: {
    a2a: string;
    status?: string;
    telemetry?: string;
  };
  auth?: {
    scheme: "bearer" | "signature" | "none";
    publicKey?: string;
  };
  embedding?: number[];
}

/** Request body for match-agents API */
export interface TaskMatchRequest {
  query: string;
  paymentAmount?: string;
  paymentToken?: string;
  deadline?: number;
  minReputationScore?: number;
  requiredCapabilities?: string[];
}

/** Ranked agent result from market maker */
export interface RankedAgent {
  agent: AgentCapabilityCard;
  score: number;
  trustScore: number;
  reason: string;
}

/** Response from match-agents API */
export interface TaskMatchResponse {
  query: string;
  agents: RankedAgent[];
  matchStrategy: string;
}
