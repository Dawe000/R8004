'use client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RankedAgent } from '@/lib/api/marketMaker';

export function AgentRouteCard({
  agent,
  selected,
  onSelect
}: {
  agent: RankedAgent;
  selected: boolean;
  onSelect: () => void;
}) {
  const trustColor = agent.trustScore > 0.8 ? 'success' : agent.trustScore > 0.6 ? 'warning' : 'secondary';

  return (
    <Card className={`p-6 cursor-pointer transition-all ${selected ? 'ring-2 ring-primary' : ''}`} onClick={onSelect}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">{agent.agent.name}</h3>
            <Badge variant={trustColor as any}>Trust: {(agent.trustScore * 100).toFixed(0)}%</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{agent.agent.description}</p>

          {/* Score Bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span>Match Score</span>
              <span className="font-medium">{(agent.score * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${agent.score * 100}%` }}
              />
            </div>
          </div>

          {/* Details */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Stake: {(parseFloat(agent.agent.sla.minAcceptanceStake) / 1e18).toFixed(4)} ETH</span>
            <span>ETA: ~{Math.ceil(agent.agent.sla.avgCompletionTime / 60)}min</span>
          </div>
        </div>

        <Button variant={selected ? 'default' : 'outline'} size="sm">
          {selected ? '✓ Selected' : 'Select'}
        </Button>
      </div>

      {/* Expandable Skills */}
      <details className="mt-4">
        <summary className="text-sm cursor-pointer text-primary">View Capabilities</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {agent.agent.skills.map((skill, i) => (
            <Badge key={i} variant="outline">{skill.name}</Badge>
          ))}
        </div>
      </details>
    </Card>
  );
}
