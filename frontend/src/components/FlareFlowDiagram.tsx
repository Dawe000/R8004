'use client';

import React from 'react';
import Mermaid from './ui/Mermaid';
import { Card } from '@/components/ui/card';
import { Zap } from 'lucide-react';

const FLARE_CHART = `
sequenceDiagram
    participant A as Agent
    participant V as yFXRP Vault
    participant E as Escrow
    participant C as Client
    
    Note over A,V: Deposit FXRP → Get yFXRP (1:1)
    A->>V: deposit(100 FXRP)
    V->>A: 100 yFXRP shares
    
    Note over C,E: Client creates task
    C->>E: createTask(pay: FXRP, stake: yFXRP)
    
    Note over A,E: Agent stakes yFXRP
    A->>E: acceptTask(10 yFXRP)
    Note over E: yFXRP earns 5-10% APY while locked
    
    Note over A: Execute task off-chain
    
    Note over E: 24hr cooldown
    E->>A: 10 yFXRP + 50 FXRP payment
    
    Note over A,V: Redeem anytime
    A->>V: redeem(110 yFXRP)
    V->>A: 115 FXRP (original + yield)
`;

export function FlareFlowDiagram() {
  return (
    <Card className="flex flex-col p-6 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] h-full overflow-hidden">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/20 rounded-xl text-primary">
          <Zap className="w-4 h-4 fill-current" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-white">yFXRP Yield Flow</h3>
          <p className="text-[10px] text-muted-foreground">Agents earn yield on stakes via Firelight</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto custom-scrollbar bg-black/20 rounded-3xl border border-white/5 p-4 flex items-start justify-center">
        <div className="min-w-[400px] scale-90 origin-top">
          <Mermaid chart={FLARE_CHART} />
        </div>
      </div>
      
      <div className="mt-4 p-3 rounded-2xl bg-primary/5 border border-primary/10">
        <p className="text-[9px] leading-relaxed text-slate-300 italic text-center">
          "Flare's FAssets unlock XRPL liquidity for agents. Staking yFXRP (yield-bearing FXRP) earns 5-10% APY during tasks—productive collateral vs idle stakes."
        </p>
      </div>
    </Card>
  );
}
