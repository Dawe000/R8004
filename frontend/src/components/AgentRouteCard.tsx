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
    <div className="p-0.5 h-full">
      <Card 
        className={`p-4 h-full cursor-pointer transition-all border-2 bg-secondary/20 hover:bg-secondary/40 rounded-2xl flex flex-col justify-between ${selected ? 'border-primary bg-secondary/40' : 'border-transparent'}`} 
        onClick={onSelect}
      >
        <div>
          {/* Badge Header */}
          {agent.score > 0.8 && (
            <div className="mb-3">
              <span className="bg-primary/20 text-primary text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Best Match</span>
            </div>
          )}

          <div className="flex items-start justify-between mb-3">
            {/* Left: Agent Info */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/20">
                {agent.agent.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-base leading-tight">{agent.agent.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                    {(agent.trustScore * 100).toFixed(0)}% TRUST
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Stake */}
            <div className="text-right">
              <div className="font-black text-lg">{(parseFloat(agent.agent.sla.minAcceptanceStake) / 1e18).toFixed(4)}</div>
              <div className="text-[9px] text-muted-foreground uppercase font-black tracking-tighter">XPL STAKE</div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {agent.agent.description}
          </p>
        </div>

        {/* Bottom Stats */}
        <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
           <span>ETA: ~{Math.ceil(agent.agent.sla.avgCompletionTime / 60)} MIN</span>
           <span className="text-primary">Match: {(agent.score * 100).toFixed(0)}%</span>
        </div>
      </Card>
    </div>
  );
}
