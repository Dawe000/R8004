'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { formatEther } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import { useEscrowTiming } from '@/hooks/useEscrowTiming';
import { TaskContestationActions } from '@/components/TaskContestationActions';
import { notifyErc8001PaymentDepositedDirect } from '@/lib/api/agents';
import { getDisputeStatusMessage, isTaskTerminal } from '@/lib/disputeFlow';
import { classifyRpcError } from '@/lib/rpcErrors';
import { getTaskDispatchMeta } from '@/lib/taskMeta';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Task, TaskStatus } from '@sdk/types';
import { RefreshCw, CheckCircle2, Clock, AlertCircle, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';

const BASE_POLL_INTERVAL_MS = 7000;
const MAX_POLL_INTERVAL_MS = 60000;

const STATUS_MAP: Record<number, { label: string; color: string; icon: ComponentType<{ className?: string }> }> = {
  [TaskStatus.Created]: { label: 'Created', color: 'text-blue-400', icon: Clock },
  [TaskStatus.Accepted]: { label: 'Accepted', color: 'text-purple-400', icon: RefreshCw },
  [TaskStatus.ResultAsserted]: { label: 'Result Asserted', color: 'text-emerald-400', icon: CheckCircle2 },
  [TaskStatus.DisputedAwaitingAgent]: { label: 'Disputed Awaiting Agent', color: 'text-orange-400', icon: AlertCircle },
  [TaskStatus.EscalatedToUMA]: { label: 'Escalated To UMA', color: 'text-yellow-400', icon: AlertCircle },
  [TaskStatus.TimeoutCancelled]: { label: 'Timeout Cancelled', color: 'text-red-400', icon: AlertCircle },
  [TaskStatus.AgentFailed]: { label: 'Agent Failed', color: 'text-red-400', icon: AlertCircle },
  [TaskStatus.Resolved]: { label: 'Resolved', color: 'text-emerald-300', icon: CheckCircle2 },
};

function shortAddress(address: string): string {
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return 'Waiting...';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(seconds: bigint): string {
  if (!seconds || seconds === 0n) return '-';
  const date = new Date(Number(seconds) * 1000);
  return `${date.toLocaleString()} (${seconds.toString()})`;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-[160px_minmax(0,1fr)] gap-3 rounded-md bg-white/[0.03] px-3 py-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all font-mono text-white">{value}</span>
    </div>
  );
}

export function TaskActivity({ taskId }: { taskId: string }) {
  const sdk = useAgentSDK();
  const { address } = useAccount();
  const {
    agentResponseWindowSec,
    disputeBondBps,
    isLoading: escrowTimingLoading,
  } = useEscrowTiming();

  const [task, setTask] = useState<Task | null>(null);
  const [paymentDeposited, setPaymentDeposited] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isNotifyingPayment, setIsNotifyingPayment] = useState(false);
  const [resultBody, setResultBody] = useState<unknown>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [readWarning, setReadWarning] = useState<string | null>(null);
  const [pollBackoffMs, setPollBackoffMs] = useState<number>(BASE_POLL_INTERVAL_MS);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const isTerminal = task ? isTaskTerminal(task) : false;

  const { data: paymentTokenSymbolData } = useReadContract({
    address: task?.paymentToken as `0x${string}` | undefined,
    abi: [
      {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
      },
    ],
    functionName: 'symbol',
    query: {
      enabled: Boolean(task?.paymentToken),
    },
  });

  const fetchTask = useCallback(async () => {
    if (!sdk) return null;
    const id = BigInt(taskId);
    const [data, deposited] = await Promise.all([
      sdk.client.getTask(id),
      sdk.client.getPaymentDeposited(id),
    ]);
    setTask(data);
    setPaymentDeposited(Boolean(deposited));
    setLastRefreshedAt(new Date().toISOString());
    return data;
  }, [sdk, taskId]);

  useEffect(() => {
    if (!sdk) return;

    let cancelled = false;
    setLoading(true);
    void fetchTask()
      .then(() => {
        if (!cancelled) {
          setReadWarning(null);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const classified = classifyRpcError(error);
        setReadWarning(classified.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sdk, fetchTask]);

  useEffect(() => {
    if (!sdk || !detailsOpen || isTerminal) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let delayMs = BASE_POLL_INTERVAL_MS;

    const poll = async () => {
      if (cancelled) return;
      try {
        const latestTask = await fetchTask();
        if (cancelled) return;
        setReadWarning(null);
        delayMs = BASE_POLL_INTERVAL_MS;
        setPollBackoffMs(delayMs);
        if (latestTask && isTaskTerminal(latestTask)) {
          return;
        }
      } catch (error: unknown) {
        if (cancelled) return;
        const classified = classifyRpcError(error);
        if (classified.kind === 'rate_limited') {
          delayMs = Math.min(MAX_POLL_INTERVAL_MS, Math.max(BASE_POLL_INTERVAL_MS, delayMs * 2));
          setReadWarning(classified.message);
        } else {
          delayMs = BASE_POLL_INTERVAL_MS;
          setReadWarning(`Read refresh failed: ${classified.message}`);
        }
        setPollBackoffMs(delayMs);
      }

      if (!cancelled) {
        timeoutId = setTimeout(() => {
          void poll();
        }, delayMs);
      }
    };

    timeoutId = setTimeout(() => {
      void poll();
    }, delayMs);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [sdk, detailsOpen, fetchTask, isTerminal]);

  useEffect(() => {
    if (!task?.resultURI) {
      setResultBody(null);
      setResultError(null);
      return;
    }
    if (Number(task.status) < TaskStatus.ResultAsserted) {
      setResultBody(null);
      setResultError(null);
      return;
    }

    let cancelled = false;
    const fetchResult = async () => {
      try {
        const response = await fetch(task.resultURI);
        if (!response.ok) {
          if (response.status === 404) {
            setResultBody(null);
            setResultError('Result endpoint returned 404 (historical/unavailable result URI).');
            return;
          }
          throw new Error(`Failed to fetch result URI (${response.status})`);
        }
        const text = await response.text();
        if (cancelled) return;
        try {
          setResultBody(JSON.parse(text));
        } catch {
          setResultBody(text);
        }
        setResultError(null);
      } catch (error: unknown) {
        if (cancelled) return;
        setResultError(error instanceof Error ? error.message : 'Failed to fetch result payload');
      }
    };

    void fetchResult();
    return () => {
      cancelled = true;
    };
  }, [task?.resultURI, task?.status]);

  if (loading) {
    return (
      <div className="h-14 w-full animate-pulse rounded-xl border border-white/5 bg-white/5" />
    );
  }

  if (!task) return null;

  const status = Number(task.status);
  const statusInfo = STATUS_MAP[status] || { label: 'Pending', color: 'text-gray-400', icon: Clock };
  const disputeStatusMessage = getDisputeStatusMessage(
    task,
    BigInt(Math.floor(Date.now() / 1000)),
    agentResponseWindowSec ?? 0n
  );
  const paymentTokenSymbol = (paymentTokenSymbolData as string | undefined) || 'TOKEN';
  const StatusIcon = statusInfo.icon;
  const normalizedAddress = address?.toLowerCase();
  const isTaskClient = Boolean(normalizedAddress && normalizedAddress === task.client.toLowerCase());
  const canDepositHere =
    status === TaskStatus.Accepted &&
    paymentDeposited === false &&
    isTaskClient;
  const canNotifyHere =
    status === TaskStatus.Accepted &&
    paymentDeposited === true &&
    isTaskClient;

  const depositDisabledReason = !isTaskClient
    ? 'Connect with the task client wallet to deposit.'
    : status !== TaskStatus.Accepted
      ? 'Deposit is only available while task is Accepted.'
      : paymentDeposited
        ? 'Payment already deposited.'
        : 'Checking payment status...';
  const notifyDisabledReason = !isTaskClient
    ? 'Connect with the task client wallet to notify.'
    : status !== TaskStatus.Accepted
      ? 'Notify is only available while task is Accepted.'
      : paymentDeposited
        ? null
        : 'Deposit payment before notifying the agent.';

  const handleNotifyPaymentDeposited = async () => {
    const dispatchMeta = getTaskDispatchMeta(task.id.toString());
    if (!dispatchMeta?.agentId) {
      toast.warning('Payment deposited, but agent notification unavailable for this historical task.');
      return;
    }

    setIsNotifyingPayment(true);
    const notifyToastId = toast.loading('Notifying agent that payment was deposited...');
    try {
      await notifyErc8001PaymentDepositedDirect({
        agentId: dispatchMeta.agentId,
        onchainTaskId: task.id.toString(),
      });
      toast.success('Agent notified. Task execution can resume.', { id: notifyToastId });
    } catch (notifyError: unknown) {
      const notifyMessage = notifyError instanceof Error ? notifyError.message : 'Unknown error';
      toast.error(`Payment deposited, but notify failed: ${notifyMessage}`, { id: notifyToastId });
    } finally {
      setIsNotifyingPayment(false);
    }
  };

  const handleDepositPayment = async () => {
    if (!sdk) {
      toast.error('Connect wallet to deposit payment.');
      return;
    }
    if (!canDepositHere) return;

    setIsDepositing(true);
    const toastId = toast.loading(`Depositing payment for task ${task.id.toString()}...`);
    try {
      await sdk.client.depositPayment(task.id);
      toast.success('Payment deposited on-chain.', { id: toastId });
      await fetchTask();
      await handleNotifyPaymentDeposited();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Deposit failed: ${message}`, { id: toastId });
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3 backdrop-blur-md transition-all hover:border-white/10">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg bg-background/50 p-2 ${statusInfo.color}`}>
          <StatusIcon className={`h-4 w-4 ${status === TaskStatus.Accepted ? 'animate-spin' : ''}`} />
        </div>
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-white">
            TASK #{taskId}
            <span className={`text-[9px] font-black uppercase ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            Agent: {shortAddress(task.agent)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="text-[10px] font-black text-white">{formatEther(task.paymentAmount)} {paymentTokenSymbol}</div>
        </div>

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-white">
              <Info className="h-3 w-3" />
              <span>View</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden border-white/15 bg-[#0f1118] text-white sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Task #{task.id.toString()} Details</DialogTitle>
              <DialogDescription className="text-xs text-slate-300">
                On-chain task state and contestation controls for testing and demonstration.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <DataRow label="Status" value={statusInfo.label} />
              <DataRow label="Client" value={task.client} />
              <DataRow label="Agent" value={task.agent} />
              <DataRow label="Payment Token" value={task.paymentToken} />
              <DataRow label="Payment Amount" value={`${formatEther(task.paymentAmount)} ${paymentTokenSymbol}`} />
              <DataRow label="Agent Stake" value={`${formatEther(task.agentStake)} ${paymentTokenSymbol}`} />
              <DataRow label="Payment Deposited" value={paymentDeposited === null ? '-' : paymentDeposited ? 'Yes' : 'No'} />
              <DataRow label="Created At" value={formatTimestamp(task.createdAt)} />
              <DataRow label="Deadline" value={formatTimestamp(task.deadline)} />
              <DataRow label="Cooldown Ends" value={formatTimestamp(task.cooldownEndsAt)} />
              <DataRow label="Client Dispute Bond" value={`${formatEther(task.clientDisputeBond)} ${paymentTokenSymbol}`} />
              <DataRow label="Agent Escalation Bond" value={`${formatEther(task.agentEscalationBond)} ${paymentTokenSymbol}`} />
              <DataRow label="Result Hash" value={task.resultHash} />
              <DataRow label="Result URI" value={task.resultURI || '-'} />
            </div>

            <div className="space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Execution Controls</p>
              <button
                onClick={handleDepositPayment}
                disabled={!canDepositHere || isDepositing}
                className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDepositing ? 'Depositing Payment...' : 'Deposit Payment'}
              </button>
              {!canDepositHere && depositDisabledReason && (
                <p className="text-[10px] text-emerald-200/80">{depositDisabledReason}</p>
              )}
              <button
                onClick={handleNotifyPaymentDeposited}
                disabled={!canNotifyHere || isNotifyingPayment}
                className="w-full rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isNotifyingPayment ? 'Notifying Agent...' : 'Notify Agent Payment Deposited'}
              </button>
              {!canNotifyHere && notifyDisabledReason && (
                <p className="text-[10px] text-emerald-200/80">{notifyDisabledReason}</p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-orange-400/20 bg-orange-950/10 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-orange-300">Dispute Lifecycle</p>
              <p className="text-[10px] text-orange-200/80">{disputeStatusMessage}</p>
              <DataRow label="Client Evidence URI" value={task.clientEvidenceURI || '-'} />
              <DataRow label="Agent Evidence URI" value={task.agentEvidenceURI || '-'} />
              <DataRow label="UMA Assertion ID" value={task.umaAssertionId || '-'} />
              <DataRow label="UMA Result Truth" value={task.umaResultTruth ? 'true' : 'false'} />
            </div>

            <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] text-slate-300">
                Last refreshed: <span className="font-mono">{lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : '-'}</span>
              </p>
              <p className="text-[10px] text-slate-300">
                Poll interval: <span className="font-mono">{detailsOpen && !isTaskTerminal(task) ? `${Math.round(pollBackoffMs / 1000)}s` : 'inactive'}</span>
              </p>
              {readWarning && <p className="text-[10px] text-yellow-300">{readWarning}</p>}
            </div>

            {(resultBody !== null || resultError) && (
              <div className="space-y-2 rounded-xl border border-cyan-400/20 bg-cyan-950/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">Result Payload</p>
                {resultError ? (
                  <p className="text-[10px] text-red-300">{resultError}</p>
                ) : (
                  <pre className="max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] text-slate-200">
                    {typeof resultBody === 'string' ? resultBody : JSON.stringify(resultBody, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <TaskContestationActions
              task={task}
              connectedAddress={address}
              agentResponseWindowSec={agentResponseWindowSec}
              disputeBondBps={disputeBondBps}
              escrowTimingLoading={escrowTimingLoading}
              onTaskUpdated={async () => {
                await fetchTask();
              }}
            />
          </DialogContent>
        </Dialog>

        <a
          href={`https://testnet.plasmascan.to/address/${task.client}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
