'use client';

import { useEffect, useState } from 'react';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import { Task, TaskStatus } from '@sdk/types';
import { RefreshCw, CheckCircle2, Clock, AlertCircle, ExternalLink } from 'lucide-react';

const STATUS_MAP: Record<number, { label: string; color: string; icon: any }> = {
  [TaskStatus.Created]: { label: 'Created', color: 'text-blue-400', icon: Clock },
  [TaskStatus.Accepted]: { label: 'Accepted', color: 'text-purple-400', icon: RefreshCw },
  [TaskStatus.ResultAsserted]: { label: 'Completed', color: 'text-green-400', icon: CheckCircle2 },
  [TaskStatus.Resolved]: { label: 'Resolved', color: 'text-emerald-400', icon: CheckCircle2 },
  [TaskStatus.AgentFailed]: { label: 'Failed', color: 'text-red-400', icon: AlertCircle },
};

export function TaskActivity({ taskId }: { taskId: string }) {
  const sdk = useAgentSDK();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTask = async () => {
      if (!sdk) return;
      try {
        const data = await sdk.client.getTask(BigInt(taskId));
        setTask(data);
      } catch (err) {
        console.error('Failed to fetch task status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
    const interval = setInterval(fetchTask, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [sdk, taskId]);

  if (loading) return (
    <div className="h-14 w-full bg-white/5 rounded-xl animate-pulse border border-white/5" />
  );
  
  if (!task) return null;

  const statusInfo = STATUS_MAP[task.status] || { label: 'Pending', color: 'text-gray-400', icon: Clock };
  const StatusIcon = statusInfo.icon;

  return (
    <div className="flex items-center justify-between p-3 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/5 hover:border-white/10 transition-all group">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-background/50 ${statusInfo.color}`}>
          <StatusIcon className={`w-4 h-4 ${task.status === TaskStatus.Accepted ? 'animate-spin' : ''}`} />
        </div>
        <div>
          <div className="text-[10px] font-bold text-white flex items-center gap-2">
            TASK #{taskId}
            <span className={`text-[9px] uppercase font-black ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>
          <div className="text-[9px] text-muted-foreground flex items-center gap-1">
            Agent: {task.agent === '0x0000000000000000000000000000000000000000' ? 'Waiting...' : `${task.agent.slice(0, 6)}...${task.agent.slice(-4)}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] font-black text-white">
            {(Number(task.paymentAmount) / 1e18).toFixed(2)} XPL
          </div>
        </div>
        <a 
          href={`https://testnet.plasmascan.to/address/${task.client}`} 
          target="_blank" 
          rel="noreferrer"
          className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
