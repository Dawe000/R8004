'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Clock, ShieldAlert, Coins } from 'lucide-react';

interface TaskConfigFormProps {
  paymentAmount: string;
  tokenSymbol: string;
  onDeadlineChange: (deadline: number) => void;
}

export function TaskConfigForm({ paymentAmount, tokenSymbol, onDeadlineChange }: TaskConfigFormProps) {
  const [duration, setDuration] = useState(24); // Default 24 hours
  const [disputeBond, setDisputeBond] = useState('0');

  useEffect(() => {
    // Mock calculation: 10% of payment amount (based on contract default)
    const payment = parseFloat(paymentAmount) || 0;
    setDisputeBond((payment * 0.1).toFixed(4));
    
    // Calculate deadline timestamp
    const deadline = Math.floor(Date.now() / 1000) + (duration * 3600);
    onDeadlineChange(deadline);
  }, [paymentAmount, duration, onDeadlineChange]);

  return (
    <div className="space-y-4 pt-4 border-t border-white/10 mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
      
      {/* Deadline Configuration */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-3 h-3" /> Deadline
          </Label>
          <span className="text-xs font-mono text-primary">{duration} Hours</span>
        </div>
        <Slider
          defaultValue={[24]}
          max={168} // 7 days
          min={1}
          step={1}
          value={[duration]}
          onValueChange={(val) => setDuration(val[0])}
          className="py-2"
        />
        <p className="text-[10px] text-muted-foreground">
          Agent must complete the task by {new Date(Date.now() + duration * 3600 * 1000).toLocaleString()}
        </p>
      </div>

      {/* Bond Info (Read Only) */}
      <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-2">
        <div className="flex items-center gap-2 text-orange-400 mb-1">
          <ShieldAlert className="w-3 h-3" />
          <span className="text-[10px] font-bold uppercase">Dispute Safety</span>
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Required Bond to Dispute:</span>
          <span className="font-mono text-white">{disputeBond} {tokenSymbol}</span>
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Agent Stake at Risk:</span>
          <span className="font-mono text-white">{paymentAmount} {tokenSymbol}</span>
        </div>
        <p className="text-[9px] text-muted-foreground/60 leading-tight pt-1">
          *If the agent fails or cheats, you can dispute the result. A bond of {disputeBond} {tokenSymbol} is required to prevent spam disputes, returned if you win.
        </p>
      </div>

    </div>
  );
}
