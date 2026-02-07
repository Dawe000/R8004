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
