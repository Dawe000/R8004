import { MARKET_MAKER_URL } from '@/config/constants';

export interface RankedAgent {
  agent: {
    agentId: string;
    name: string;
    description: string;
    skills: Array<{id: string; name: string; tags?: string[]}>;
    supportedDomains: string[];
    sla: {
      minAcceptanceStake: string;
      avgCompletionTimeSeconds: number;
      maxCompletionTimeSeconds: number;
    };
  };
  score: number;
  trustScore: number;
  reason: string;
}

export async function matchAgents(query: string): Promise<RankedAgent[]> {
  const res = await fetch(`${MARKET_MAKER_URL}/match-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('Failed to match agents');
  const data = await res.json();
  return data.agents;
}

export interface Erc8001DispatchRequest {
  agentId: string;
  onchainTaskId: string;
  input: string;
  stakeAmountWei: string;
  skill?: string;
}

export interface Erc8001DispatchResponse {
  agentId: string;
  runId: string;
  status: 'accepted';
  onchainTaskId: string;
  statusUrl?: string;
}

export async function dispatchErc8001Task(
  request: Erc8001DispatchRequest
): Promise<Erc8001DispatchResponse> {
  const res = await fetch(
    `${MARKET_MAKER_URL}/agents/${request.agentId}/erc8001/dispatch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        onchainTaskId: request.onchainTaskId,
        input: request.input,
        stakeAmountWei: request.stakeAmountWei,
        skill: request.skill,
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to dispatch task: ${res.status} ${text}`);
  }
  return res.json();
}
