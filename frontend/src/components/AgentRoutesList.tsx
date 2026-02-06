'use client';
import { useState } from 'react';
import { AgentRouteCard } from './AgentRouteCard';
import { RankedAgent } from '@/lib/api/marketMaker';
import { Button } from '@/components/ui/button';

export function AgentRoutesList({ agents }: { agents: RankedAgent[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleCreateTask = () => {
    if (!selectedId) return;
    alert('Wallet connection needed for task creation (Phase 2)');
  };

  return (
    <div className="w-full max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold mb-4">Top Agents for Your Task</h2>

      {agents.map((agent) => (
        <AgentRouteCard
          key={agent.agent.agentId}
          agent={agent}
          selected={selectedId === agent.agent.agentId}
          onSelect={() => setSelectedId(agent.agent.agentId)}
        />
      ))}

      <Button
        className="w-full h-12"
        disabled={!selectedId}
        onClick={handleCreateTask}
      >
        {selectedId ? 'Create Task (Connect Wallet)' : 'Select an Agent'}
      </Button>
    </div>
  );
}
