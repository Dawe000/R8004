'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'ethers';
import { TaskStatus, type Task } from '@sdk/types';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import { getContestationTiming, getDisputeEligibility, getSettleEligibility } from '@/lib/contestation';

interface TaskContestationActionsProps {
  task: Task;
  connectedAddress?: string;
  agentResponseWindowSec: bigint | null;
  disputeBondBps: bigint | null;
  onTaskUpdated?: () => Promise<void> | void;
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return '-';
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remaining}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remaining}s`;
  }
  return `${remaining}s`;
}

function formatTimestamp(unixSec: bigint): string {
  const date = new Date(Number(unixSec) * 1000);
  return `${date.toLocaleString()} (${unixSec.toString()})`;
}

function normalizeTxError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : 'Unknown error';
  const message = rawMessage.toLowerCase();

  if (message.includes('user rejected') || message.includes('user denied')) {
    return 'Transaction rejected in wallet.';
  }

  if (message.includes('insufficient funds')) {
    return 'Insufficient funds to cover gas or required token amount.';
  }

  if (message.includes('execution reverted') || message.includes('call_exception')) {
    return 'Transaction reverted on-chain. Verify task status, wallet, and dispute timing window.';
  }

  return rawMessage;
}

export function TaskContestationActions({
  task,
  connectedAddress,
  agentResponseWindowSec,
  disputeBondBps,
  onTaskUpdated,
}: TaskContestationActionsProps) {
  const sdk = useAgentSDK();
  const [nowSec, setNowSec] = useState<number>(Math.floor(Date.now() / 1000));
  const [evidenceUri, setEvidenceUri] = useState<string>(task.clientEvidenceURI || '');
  const [isDisputing, setIsDisputing] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setEvidenceUri(task.clientEvidenceURI || '');
  }, [task.id, task.clientEvidenceURI]);

  const responseWindow = agentResponseWindowSec ?? 0n;
  const trimmedEvidenceUri = evidenceUri.trim();

  const timing = useMemo(() => {
    return getContestationTiming(task, nowSec, responseWindow);
  }, [task, nowSec, responseWindow]);

  const disputeEligibility = useMemo(() => {
    return getDisputeEligibility(task, nowSec, connectedAddress, trimmedEvidenceUri);
  }, [task, nowSec, connectedAddress, trimmedEvidenceUri]);

  const settleEligibility = useMemo(() => {
    return getSettleEligibility(task, nowSec, agentResponseWindowSec, connectedAddress);
  }, [task, nowSec, agentResponseWindowSec, connectedAddress]);

  const expectedDisputeBond = useMemo(() => {
    if (disputeBondBps === null) return null;
    return (task.paymentAmount * disputeBondBps) / 10000n;
  }, [task.paymentAmount, disputeBondBps]);

  if (task.status !== TaskStatus.ResultAsserted && task.status !== TaskStatus.DisputedAwaitingAgent) {
    return null;
  }

  const handleDispute = async () => {
    if (!sdk) {
      toast.error('Connect wallet to submit dispute.');
      return;
    }

    if (!disputeEligibility.enabled) {
      toast.error(disputeEligibility.reason ?? 'Task cannot be disputed right now.');
      return;
    }

    setIsDisputing(true);
    const toastId = toast.loading(`Submitting dispute for task ${task.id.toString()}...`);

    try {
      await sdk.client.disputeTask(task.id, trimmedEvidenceUri);
      toast.success('Task disputed. Waiting for agent response window.', { id: toastId });
      await onTaskUpdated?.();
    } catch (error: unknown) {
      const message = normalizeTxError(error);
      toast.error(`Dispute failed: ${message}`, { id: toastId });
    } finally {
      setIsDisputing(false);
    }
  };

  const handleSettleConceded = async () => {
    if (!sdk) {
      toast.error('Connect wallet to settle.');
      return;
    }

    if (!settleEligibility.enabled) {
      toast.error(settleEligibility.reason ?? 'Task cannot be settled as agent conceded right now.');
      return;
    }

    setIsSettling(true);
    const toastId = toast.loading(`Settling task ${task.id.toString()} (agent conceded)...`);

    try {
      await sdk.client.settleAgentConceded(task.id);
      toast.success('Task settled: client wins by agent concession.', { id: toastId });
      await onTaskUpdated?.();
    } catch (error: unknown) {
      const message = normalizeTxError(error);
      toast.error(`Settle failed: ${message}`, { id: toastId });
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-orange-400/30 bg-orange-950/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-orange-300">Contestation Controls</p>
          <p className="text-[10px] text-orange-100/70">Testing and demo actions for disputed completion handling.</p>
        </div>
        <div className="text-right text-[10px] text-orange-200/80">
          {timing.secondsRemaining !== null && (
            <p>{formatDuration(timing.secondsRemaining)} remaining</p>
          )}
          {timing.deadlineUnix !== null && (
            <p>Window deadline: {formatTimestamp(timing.deadlineUnix)}</p>
          )}
        </div>
      </div>

      {expectedDisputeBond !== null && (
        <p className="text-[10px] text-orange-200/80">
          Expected dispute bond: <span className="font-mono text-orange-100">{formatEther(expectedDisputeBond)} TST</span>
        </p>
      )}
      <p className="text-[10px] text-orange-200/80">
        Cooldown ends: <span className="font-mono text-orange-100">{formatTimestamp(task.cooldownEndsAt)}</span>
      </p>

      {task.status === TaskStatus.ResultAsserted && (
        <div className="space-y-2">
          <Input
            value={evidenceUri}
            onChange={(event) => setEvidenceUri(event.target.value)}
            placeholder="ipfs://... or https://..."
            className="h-8 border-orange-500/40 bg-black/20 text-xs"
          />
          <button
            onClick={handleDispute}
            disabled={!disputeEligibility.enabled || isDisputing}
            className="w-full rounded-lg bg-orange-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDisputing ? 'Submitting Dispute...' : 'Dispute Result'}
          </button>
          {disputeEligibility.reason && (
            <p className="text-[10px] text-orange-200/80">{disputeEligibility.reason}</p>
          )}
        </div>
      )}

      {task.status === TaskStatus.DisputedAwaitingAgent && (
        <div className="space-y-2">
          <button
            onClick={handleSettleConceded}
            disabled={!settleEligibility.enabled || isSettling}
            className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSettling ? 'Settling...' : 'Settle Agent Conceded'}
          </button>
          {settleEligibility.reason && (
            <p className="text-[10px] text-orange-200/80">{settleEligibility.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
