'use client';

import { useEffect, useState } from 'react';
import { TaskActivity } from './TaskActivity';
import { History, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import { useEscrowTiming } from '@/hooks/useEscrowTiming';
import type { Task } from '@sdk/types';

function loadTaskIdsFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = JSON.parse(localStorage.getItem('r8004_tasks') || '[]');
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => String(value))
    .filter((value) => /^\d+$/.test(value));
}

function sortTaskIdsDesc(taskIds: string[]): string[] {
  return [...taskIds].sort((a, b) => {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) return 0;
    return left > right ? -1 : 1;
  });
}

function mergeUniqueTaskIds(taskIds: string[]): string[] {
  const unique = new Set(taskIds.filter((value) => /^\d+$/.test(value)));
  return sortTaskIdsDesc(Array.from(unique));
}

export function TaskHistoryList({ allTime = false }: { allTime?: boolean }) {
  const { address } = useAccount();
  const sdk = useAgentSDK();
  const { agentResponseWindowSec, disputeBondBps, isLoading: escrowTimingLoading } = useEscrowTiming();
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [taskSnapshots, setTaskSnapshots] = useState<Record<string, Task>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchOnChainHistory = async () => {
      if (!allTime) return;
      setLoading(true);
      try {
        const saved = loadTaskIdsFromStorage();
        if (sdk && address) {
          const onChainTasks = await sdk.client.getMyTasks(false);
          const onChainIds = onChainTasks.map((task) => task.id.toString());
          const snapshots = Object.fromEntries(
            onChainTasks.map((task) => [task.id.toString(), task])
          ) as Record<string, Task>;
          setTaskSnapshots(snapshots);
          setTaskIds(mergeUniqueTaskIds([...saved, ...onChainIds]));
        } else {
          setTaskSnapshots({});
          setTaskIds(mergeUniqueTaskIds(saved));
        }
      } catch (err) {
        console.error('Failed to fetch task history:', err);
        const saved = loadTaskIdsFromStorage();
        setTaskSnapshots({});
        setTaskIds(mergeUniqueTaskIds(saved));
      } finally {
        setLoading(false);
      }
    };

    if (allTime) {
      fetchOnChainHistory();
    } else {
      setTaskSnapshots({});
      // Local storage fallback for the quick dashboard view
      const updateTasks = () => {
        const saved = loadTaskIdsFromStorage();
        setTaskIds(sortTaskIdsDesc(saved).slice(0, 5));
      };
      updateTasks();
      const interval = setInterval(updateTasks, 5000);
      return () => clearInterval(interval);
    }
  }, [sdk, address, allTime]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-xs font-bold uppercase tracking-widest">Scanning Blockchain...</p>
      </div>
    );
  }

  if (taskIds.length === 0) {
    return (
      <div className="text-center py-12 opacity-40">
        <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="text-sm">No tasks found for this account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!allTime && (
        <div className="flex items-center gap-2 px-1">
          <History className="w-3 h-3 text-primary" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent Activity</h4>
        </div>
      )}
      <div className={`space-y-2 ${allTime ? '' : 'max-h-[240px] overflow-y-auto custom-scrollbar pr-1'}`}>
        {taskIds.map((id) => (
          <TaskActivity
            key={id}
            taskId={id}
            initialTask={taskSnapshots[id] ?? null}
            agentResponseWindowSec={agentResponseWindowSec}
            disputeBondBps={disputeBondBps}
            escrowTimingLoading={escrowTimingLoading}
          />
        ))}
      </div>
    </div>
  );
}
