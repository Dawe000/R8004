export async function getAgentCard(agentId: string) {
  const res = await fetch(`https://example-agent.lynethlabs.workers.dev/${agentId}/card`);
  if (!res.ok) throw new Error('Failed to fetch agent');
  return res.json();
}
