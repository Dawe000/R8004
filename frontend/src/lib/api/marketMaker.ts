export interface RankedAgent {
  agent: {
    agentId: string;
    name: string;
    description: string;
    skills: Array<{name: string; tags: string[]}>;
    supportedDomains: string[];
    sla: {
      minAcceptanceStake: string;
      avgCompletionTime: number;
      maxCompletionTime: number;
    };
  };
  score: number;
  trustScore: number;
  reason: string;
}

export async function matchAgents(query: string): Promise<RankedAgent[]> {
  const res = await fetch('https://market-maker-agent.lynethlabs.workers.dev/api/match-agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('Failed to match agents');
  const data = await res.json();
  return data.agents;
}
