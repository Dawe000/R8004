'use client';
import { useState } from 'react';
import { AgentRouteCard } from './AgentRouteCard';
import { RankedAgent } from '@/lib/api/marketMaker';
import { Button } from '@/components/ui/button';

export function AgentRoutesList({ 
  agents, 
  selectedId, 
  onSelect 
}: { 
  agents: RankedAgent[], 
  selectedId: string | null,
  onSelect: (id: string) => void
}) {
  // Show only top 3 agents
  const topAgents = agents.slice(0, 3);

  return (
    <div className="w-full h-full flex flex-col gap-3">
      {topAgents.map((agent) => (
        <div key={agent.agent.agentId} className="flex-1">
          <AgentRouteCard
            agent={agent}
            selected={selectedId === agent.agent.agentId}
            onSelect={() => onSelect(agent.agent.agentId)}
          />
        </div>
      ))}
    </div>
  );
}
