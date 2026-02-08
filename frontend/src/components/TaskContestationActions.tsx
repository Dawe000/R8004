'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'ethers';
import { TaskStatus, type Task } from '@sdk/types';
import { toast } from 'sonner';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import { getContestationTiming, getDisputeEligibility, getSettleEligibility } from '@/lib/contestation';
import { getDisputePhase, getDisputeStatusMessage } from '@/lib/disputeFlow';
import { isLikelyUri } from '@sdk/index';
import { classifyRpcError } from '@/lib/rpcErrors';

interface TaskContestationActionsProps {
  task: Task;
  connectedAddress?: string;
  agentResponseWindowSec: bigint | null;
  disputeBondBps: bigint | null;
  escrowTimingLoading?: boolean;
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
  return classifyRpcError(error).message;
}

function hasUmaAssertion(task: Task): boolean {
  const value = String(task.umaAssertionId || '');
  return Boolean(
    value
    && value !== '0x'
    && value !== '0x0000000000000000000000000000000000000000000000000000000000000000'
  );
}

function displayEvidenceValue(value?: string): string {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : 'Not provided';
}

function displayAssertionId(value?: string): string {
  const assertionId = String(value || '');
  if (
    !assertionId
    || assertionId === '0x'
    || assertionId === '0x0000000000000000000000000000000000000000000000000000000000000000'
  ) {
    return 'Not escalated yet';
  }
  return assertionId;
}

export function TaskContestationActions({
  task,
  connectedAddress,
  agentResponseWindowSec,
  disputeBondBps,
  escrowTimingLoading = true,
  onTaskUpdated,
}: TaskContestationActionsProps) {
  const sdk = useAgentSDK();
  const [nowSec, setNowSec] = useState<number>(Math.floor(Date.now() / 1000));
  const [evidence, setEvidence] = useState<string>(task.clientEvidenceURI || '');
  const [isDisputing, setIsDisputing] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setEvidence(task.clientEvidenceURI || '');
  }, [task.id, task.clientEvidenceURI]);

  const responseWindow = agentResponseWindowSec ?? 0n;
  const trimmedEvidence = evidence.trim();
  const status = Number(task.status);
  const disputePhase = useMemo(() => {
    return getDisputePhase(task, nowSec, responseWindow);
  }, [task, nowSec, responseWindow]);
  const disputeStatusMessage = useMemo(() => {
    return getDisputeStatusMessage(task, nowSec, responseWindow);
  }, [task, nowSec, responseWindow]);

  const timing = useMemo(() => {
    return getContestationTiming(task, nowSec, responseWindow);
  }, [task, nowSec, responseWindow]);

  const disputeEligibility = useMemo(() => {
    return getDisputeEligibility(task, nowSec, connectedAddress, trimmedEvidence, trimmedEvidence);
  }, [task, nowSec, connectedAddress, trimmedEvidence]);

  const settleEligibility = useMemo(() => {
    return getSettleEligibility(task, nowSec, agentResponseWindowSec, connectedAddress, escrowTimingLoading);
  }, [task, nowSec, agentResponseWindowSec, connectedAddress, escrowTimingLoading]);

  const expectedDisputeBond = useMemo(() => {
    if (disputeBondBps === null) return null;
    return (task.paymentAmount * disputeBondBps) / 10000n;
  }, [task.paymentAmount, disputeBondBps]);

  if (
    status !== TaskStatus.ResultAsserted
    && status !== TaskStatus.DisputedAwaitingAgent
    && status !== TaskStatus.EscalatedToUMA
    && status !== TaskStatus.Resolved
  ) {
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
    let toastId = toast.loading(`Preparing dispute for task ${task.id.toString()}...`);

    try {
      let evidenceUri: string;
      if (trimmedEvidence && isLikelyUri(trimmedEvidence)) {
        evidenceUri = trimmedEvidence;
      } else {
        toast.loading(`Uploading evidence to IPFS...`, { id: toastId });
        const res = await fetch('/api/ipfs/evidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: trimmedEvidence || 'Client disputes task result.' }),
        });
        const data = (await res.json()) as { uri?: string; error?: string; details?: string };
        if (!res.ok) {
          throw new Error(data.details || data.error || 'Failed to upload evidence');
        }
        if (!data.uri) throw new Error('No URI returned from IPFS upload');
        evidenceUri = data.uri;
      }

      toast.loading(`Submitting dispute for task ${task.id.toString()}...`, { id: toastId });
      await sdk.client.disputeTask(task.id, evidenceUri);
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
          <p className="text-[10px] text-orange-100/70">{disputeStatusMessage}</p>
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
      <p className="text-[10px] text-orange-200/80">
        Agent escalation and evidence upload are automated by agent cron. Frontend does not trigger escalation tx directly.
      </p>

      {status === TaskStatus.ResultAsserted && (
        <div className="space-y-2">
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Describe why you're disputing (uploaded to IPFS), or paste an ipfs:// / https:// URI"
            rows={3}
            className="w-full resize-y rounded border border-orange-500/40 bg-black/20 px-2 py-1.5 text-xs text-white placeholder:text-orange-300/60"
          />
          <button
            onClick={handleDispute}
            disabled={!disputeEligibility.enabled || isDisputing}
            className="w-full rounded-lg bg-orange-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDisputing ? 'Uploading & disputing...' : 'Upload evidence & dispute'}
          </button>
          {disputeEligibility.reason && (
            <p className="text-[10px] text-orange-200/80">{disputeEligibility.reason}</p>
          )}
        </div>
      )}

      {status === TaskStatus.DisputedAwaitingAgent && (
        <div className="space-y-2">
          <p className="text-[10px] text-orange-200/80 break-all">
            Client evidence on-chain: <span className="font-mono text-orange-100">{displayEvidenceValue(task.clientEvidenceURI)}</span>
          </p>
          <p className="text-[10px] text-orange-200/80 break-all">
            UMA assertion: <span className="font-mono text-orange-100">{displayAssertionId(task.umaAssertionId)}</span>
          </p>
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

      {(status === TaskStatus.EscalatedToUMA || (status === TaskStatus.Resolved && hasUmaAssertion(task))) && (
        <div className="space-y-2 rounded-lg border border-yellow-400/30 bg-yellow-900/10 p-2">
          <p className="text-[10px] text-yellow-200">
            Dispute phase: <span className="font-semibold">{disputePhase}</span>
          </p>
          <p className="text-[10px] text-yellow-200 break-all">
            Agent Evidence URI: <span className="font-mono text-yellow-100">{displayEvidenceValue(task.agentEvidenceURI)}</span>
          </p>
          <p className="text-[10px] text-yellow-200 break-all">
            UMA Assertion ID: <span className="font-mono text-yellow-100">{displayAssertionId(task.umaAssertionId)}</span>
          </p>
        </div>
      )}

      {status === TaskStatus.Resolved && hasUmaAssertion(task) && (
        <p className="text-[10px] text-orange-200/80">
          Resolution: <span className="font-mono text-orange-100">{task.umaResultTruth ? 'Agent won (assertion true)' : 'Client won (assertion false)'}</span>
        </p>
      )}
    </div>
  );
}
