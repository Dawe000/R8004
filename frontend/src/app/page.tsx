'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TaskSearchBox } from '@/components/TaskSearchBox';
import { AgentRoutesList } from '@/components/AgentRoutesList';
import { TaskConfigForm } from '@/components/TaskConfigForm';
import { TaskContestationActions } from '@/components/TaskContestationActions';
import { ExchangeTaskProgressPanel } from '@/components/ExchangeTaskProgressPanel';
import { useAgentMatching } from '@/hooks/useAgentMatching';
import { useEscrowTiming } from '@/hooks/useEscrowTiming';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Settings, RefreshCw } from 'lucide-react';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import DarkVeil from '@/components/ui/DarkVeil';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import {
  createTaskSpecUri,
  dispatchErc8001TaskDirect,
  notifyErc8001PaymentDepositedDirect,
} from '@/lib/api/agents';
import { getTaskDispatchMeta, upsertTaskDispatchMeta } from '@/lib/taskMeta';
import { formatUnits, parseUnits } from 'ethers';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { TaskStatus, type Task } from '@sdk/types';
import {
  COSTON2_FIRELIGHT_DEFAULTS,
  ONCHAIN_TASK_SPEC_V1,
  PLASMA_TESTNET_DEFAULTS,
} from '@sdk/index';
import { toast } from 'sonner';
import { getDisputeStatusMessage } from '@/lib/disputeFlow';

const TASK_STATUS_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Created',
  2: 'Accepted',
  3: 'Result Asserted',
  4: 'Disputed Awaiting Agent',
  5: 'Escalated To UMA',
  6: 'Timeout Cancelled',
  7: 'Agent Failed',
  8: 'Resolved',
};

const TERMINAL_STATUSES = new Set<number>([
  TaskStatus.TimeoutCancelled,
  TaskStatus.AgentFailed,
  TaskStatus.Resolved,
]);

const CONTESTATION_VISIBLE_STATUSES = new Set<number>([
  TaskStatus.ResultAsserted,
  TaskStatus.DisputedAwaitingAgent,
  TaskStatus.EscalatedToUMA,
  TaskStatus.Resolved,
]);

const SUPPORTED_DIRECT_EXECUTION_CHAINS = new Set<number>([
  PLASMA_TESTNET_DEFAULTS.chainId,
  COSTON2_FIRELIGHT_DEFAULTS.chainId,
]);

const MARKETMAKER_STAKE_DECIMALS = 18;

function scaleAmount(rawAmount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (fromDecimals === toDecimals) return rawAmount;
  if (fromDecimals > toDecimals) {
    return rawAmount / (10n ** BigInt(fromDecimals - toDecimals));
  }
  return rawAmount * (10n ** BigInt(toDecimals - fromDecimals));
}

export default function Home() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [query, setQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('0.00');
  const [deadline, setDeadline] = useState(Math.floor(Date.now() / 1000) + 3600);
  const [isCreating, setIsCreating] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isNotifyingPayment, setIsNotifyingPayment] = useState(false);

  const [activeTaskId, setActiveTaskId] = useState<bigint | null>(null);
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [lastFetchedResultUri, setLastFetchedResultUri] = useState<string | null>(null);
  const [paymentDeposited, setPaymentDeposited] = useState(false);
  const [agentResult, setAgentResult] = useState<unknown>(null);
  const [pollError, setPollError] = useState<string | null>(null);

    const { data: agents, isLoading, error } = useAgentMatching(query);
    const sdk = useAgentSDK();
    const { agentResponseWindowSec, disputeBondBps, isLoading: escrowTimingLoading } = useEscrowTiming();
  
    const isPlasmaChain = chainId === PLASMA_TESTNET_DEFAULTS.chainId;
    const isCoston2Chain = chainId === COSTON2_FIRELIGHT_DEFAULTS.chainId;
  const isSupportedExecutionChain = SUPPORTED_DIRECT_EXECUTION_CHAINS.has(chainId);
  const paymentTokenAddress = isPlasmaChain
    ? PLASMA_TESTNET_DEFAULTS.mockTokenAddress
    : isCoston2Chain
      ? COSTON2_FIRELIGHT_DEFAULTS.fxrpTokenAddress
      : PLASMA_TESTNET_DEFAULTS.mockTokenAddress;

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId || !agents) return null;
    return agents.find((agent) => agent.agent.agentId === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  const { data: balance } = useReadContract({
    address: paymentTokenAddress as `0x${string}`,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ],
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: paymentTokenSymbolData } = useReadContract({
    address: paymentTokenAddress as `0x${string}`,
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
      enabled: !!address,
    },
  });

  const { data: paymentTokenDecimalsData } = useReadContract({
    address: paymentTokenAddress as `0x${string}`,
    abi: [
      {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
      },
    ],
    functionName: 'decimals',
    query: {
      enabled: !!address,
    },
  });

  const paymentTokenDecimals =
    typeof paymentTokenDecimalsData === 'number'
      ? paymentTokenDecimalsData
      : isCoston2Chain
        ? 6
        : 18;

  const paymentTokenSymbol = (paymentTokenSymbolData as string | undefined)
    || (isPlasmaChain ? 'TST' : isCoston2Chain ? 'C2FLR' : 'TOKEN');

  const networkLogo = isCoston2Chain ? "/flare.png" : "/chain-light.svg";

  useEffect(() => {
    if (!selectedAgent?.agent.sla?.minAcceptanceStake) return;
    const rawStake = BigInt(selectedAgent.agent.sla.minAcceptanceStake);
    const tokenStake = scaleAmount(
      rawStake,
      MARKETMAKER_STAKE_DECIMALS,
      paymentTokenDecimals
    );
    setPaymentAmount(formatUnits(tokenStake, paymentTokenDecimals));
  }, [paymentTokenDecimals, selectedAgent]);

  const refreshActiveTask = useCallback(async () => {
    if (!sdk || activeTaskId === null) return;

    const [task, deposited] = await Promise.all([
      sdk.client.getTask(activeTaskId),
      sdk.client.getPaymentDeposited(activeTaskId),
    ]);

    setActiveTask(task);
    setPaymentDeposited(Boolean(deposited));

    const status = Number(task.status);
    if (
      task.resultURI &&
      status >= TaskStatus.ResultAsserted &&
      task.resultURI !== lastFetchedResultUri
    ) {
      const response = await fetch(task.resultURI);
      if (!response.ok) {
        if (response.status === 404) {
          // Historical/expired result endpoints should not break chain polling.
          return;
        }
        throw new Error(`Failed to fetch result URI (${response.status})`);
      }
      const text = await response.text();
      try {
        setAgentResult(JSON.parse(text));
      } catch {
        setAgentResult(text);
      }
      setLastFetchedResultUri(task.resultURI);
    }
  }, [sdk, activeTaskId, lastFetchedResultUri]);

  useEffect(() => {
    if (!sdk || activeTaskId === null) return;

    let cancelled = false;

    const pollTask = async () => {
      try {
        await refreshActiveTask();
        if (!cancelled) {
          setPollError(null);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setPollError(err instanceof Error ? err.message : 'Task polling failed');
      }
    };

    void pollTask();
    const intervalId = setInterval(() => {
      void pollTask();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [sdk, activeTaskId, refreshActiveTask]);

  const handleCreateTask = async () => {
    if (!sdk || !query || !selectedAgent) return;

    setIsCreating(true);
    const toastId = toast.loading('Creating task intent on-chain...');

    try {
      if (!isSupportedExecutionChain) {
        throw new Error(
          `Direct agent execution supports Plasma Testnet (${PLASMA_TESTNET_DEFAULTS.chainId}) and Flare Coston2 (${COSTON2_FIRELIGHT_DEFAULTS.chainId}).`
        );
      }

      if (!selectedAgent.agent.sla?.minAcceptanceStake) {
        throw new Error('Selected agent is missing minAcceptanceStake');
      }

      const amount = parseUnits(paymentAmount, paymentTokenDecimals);
      const stakeAmount = scaleAmount(
        BigInt(selectedAgent.agent.sla.minAcceptanceStake),
        MARKETMAKER_STAKE_DECIMALS,
        paymentTokenDecimals
      );

      const taskSpecUri = await createTaskSpecUri({
        version: ONCHAIN_TASK_SPEC_V1,
        input: query.trim(),
        ...(selectedAgent.agent.skills?.[0]?.id ? { skill: selectedAgent.agent.skills[0].id } : {}),
        ...(address ? { client: address } : {}),
        createdAt: new Date().toISOString(),
      });

      const taskId = await sdk.client.createTask(
        taskSpecUri,
        paymentTokenAddress,
        amount,
        deadline
      );

      toast.loading('Dispatching task directly to selected agent...', { id: toastId });

      const dispatchResult = await dispatchErc8001TaskDirect({
        agentId: selectedAgent.agent.agentId,
        chainId,
        onchainTaskId: taskId.toString(),
        stakeAmountWei: stakeAmount.toString(),
        skill: selectedAgent.agent.skills?.[0]?.id,
      });

      setActiveTaskId(taskId);
      setActiveAgentRunId(dispatchResult.runId);
      setActiveTask(null);
      setLastFetchedResultUri(null);
      setPaymentDeposited(false);
      setAgentResult(null);
      setPollError(null);

      if (typeof window !== 'undefined') {
        const savedTasks = JSON.parse(localStorage.getItem('r8004_tasks') || '[]');
        localStorage.setItem('r8004_tasks', JSON.stringify([...savedTasks, taskId.toString()]));
        upsertTaskDispatchMeta(chainId, taskId.toString(), {
          agentId: dispatchResult.agentId,
          runId: dispatchResult.runId,
        });
      }

      toast.success(
        `Task ${taskId.toString()} created and dispatched. Wait for Accepted status, then click Deposit Payment.`,
        { id: toastId }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Error: ${message}`, { id: toastId });
    } finally {
      setIsCreating(false);
    }
  };

  const handleNotifyPaymentDeposited = useCallback(
    async (taskId: bigint) => {
      if (!isSupportedExecutionChain) {
        toast.warning('Agent payment notification is only available on supported execution chains.');
        return;
      }

      const dispatchMeta = getTaskDispatchMeta(chainId, taskId.toString());
      if (!dispatchMeta?.agentId) {
        toast.warning('Payment deposited, but agent notification metadata is missing for this task.');
        return;
      }

      setIsNotifyingPayment(true);
      const notifyToastId = toast.loading('Notifying agent that payment was deposited...');
      try {
        await notifyErc8001PaymentDepositedDirect({
          agentId: dispatchMeta.agentId,
          chainId,
          onchainTaskId: taskId.toString(),
        });
        toast.success('Agent notified. Task execution can resume.', { id: notifyToastId });
      } catch (notifyErr: unknown) {
        const notifyMessage = notifyErr instanceof Error ? notifyErr.message : 'Unknown error';
        toast.error(`Payment deposited, but notify failed: ${notifyMessage}`, { id: notifyToastId });
      } finally {
        setIsNotifyingPayment(false);
      }
    },
    [chainId, isSupportedExecutionChain]
  );

  const handleDepositPayment = async () => {
    if (!sdk || activeTaskId === null) return;

    setIsDepositing(true);
    const toastId = toast.loading(`Depositing payment for task ${activeTaskId.toString()}...`);

    try {
      await sdk.client.depositPayment(activeTaskId);
      setPaymentDeposited(true);
      await refreshActiveTask();
      toast.success('Payment deposited on-chain.', { id: toastId });

      await handleNotifyPaymentDeposited(activeTaskId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Deposit failed: ${message}`, { id: toastId });
    } finally {
      setIsDepositing(false);
    }
  };

  const activeTaskStatus = activeTask ? Number(activeTask.status) : null;
  const taskStatusLabel = activeTaskStatus === null
    ? 'No Active Task'
    : TASK_STATUS_LABELS[activeTaskStatus] || `Unknown (${activeTaskStatus})`;
  const isTaskInProgress = activeTaskId !== null
    && (activeTaskStatus === null || !TERMINAL_STATUSES.has(activeTaskStatus));
  const showRecommendedAgents = !isTaskInProgress;
  const showCreateButton =
    activeTaskId === null
    || (activeTaskStatus !== null && TERMINAL_STATUSES.has(activeTaskStatus));
  const showTaskActions = activeTaskStatus !== null && CONTESTATION_VISIBLE_STATUSES.has(activeTaskStatus);
  const hasResultGenerated = activeTaskStatus !== null && activeTaskStatus >= TaskStatus.ResultAsserted;
  const showDepositPaymentButton = activeTaskId !== null
    && activeTaskStatus === TaskStatus.Accepted
    && !paymentDeposited
    && !hasResultGenerated;
  const showNotifyPaymentButton = activeTaskId !== null
    && activeTaskStatus === TaskStatus.Accepted
    && paymentDeposited
    && !hasResultGenerated;
  const hasRequestLowerContent = showTaskActions
    || showCreateButton
    || (activeTaskStatus !== null && TERMINAL_STATUSES.has(activeTaskStatus));
  const activeTaskDisputeMessage = activeTask
    && (
      Number(activeTask.status) === TaskStatus.ResultAsserted
      || Number(activeTask.status) === TaskStatus.DisputedAwaitingAgent
      || Number(activeTask.status) === TaskStatus.EscalatedToUMA
      || Number(activeTask.status) === TaskStatus.Resolved
    )
    ? getDisputeStatusMessage(
        activeTask,
        BigInt(Math.floor(Date.now() / 1000)),
        agentResponseWindowSec ?? 0n
      )
    : null;

  return (
    <main className="h-screen w-full bg-[#0a0a0f] text-foreground flex flex-col overflow-hidden relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-60">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0}
          scanlineIntensity={0}
          speed={0.2}
          scanlineFrequency={0}
          warpAmount={0}
        />
      </div>

      <nav className="flex-none flex items-center justify-between py-4 px-8 border-b border-white/5 relative z-30 backdrop-blur-md bg-background/20">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-16 h-16 relative">
              <Image src="/R8004_logo.png" alt="R8004 Logo" fill className="object-contain" />
            </div>
            <span className="text-4xl font-black tracking-tighter text-white">R8004</span>
          </Link>
        </div>
        <div className="hidden md:flex gap-1 p-1 bg-white/5 rounded-full border border-white/10">
          <button className="px-4 py-1.5 rounded-full bg-white/10 text-white font-medium text-xs transition-all">Exchange</button>
          <Link href="/activity">
            <button className="px-4 py-1.5 rounded-full hover:bg-white/5 text-muted-foreground font-medium text-xs transition-all">Activity</button>
          </Link>
          <Link href="/plasma">
            <button
              className={`px-4 py-1.5 rounded-full font-bold text-xs transition-all ${
                isPlasmaChain
                  ? 'bg-[#162f29] text-[#4ade80] shadow-lg shadow-green-900/20'
                  : 'hover:bg-[#162f29]/20 text-muted-foreground hover:text-[#4ade80]'
              }`}
            >
              Plasma Flow
            </button>
          </Link>
          {isCoston2Chain && (
            <Link href="/fassets">
              <button className="px-4 py-1.5 rounded-full hover:bg-[#fbcfe8]/10 text-muted-foreground hover:text-[#fbcfe8] font-bold text-xs transition-all">FAssets Flow</button>
            </Link>
          )}
        </div>
        <ConnectButton />
      </nav>

      <div className="flex-1 w-full flex items-center justify-center relative z-20 p-4">
        <div className="w-full max-w-4xl mx-auto transition-all duration-500 grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
          <Card className="flex flex-col p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] relative overflow-hidden h-full">
            <div className="flex justify-between items-center mb-6 flex-none">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight text-white">Request Task</h2>
              </div>
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Settings className="text-muted-foreground w-5 h-5" />
              </button>
            </div>

            <div className={`flex-1 flex flex-col gap-3 relative min-h-0 pr-2 ${hasRequestLowerContent ? 'overflow-y-auto' : ''}`}>
              <div className={`bg-white/[0.05] rounded-3xl p-6 border border-white/10 hover:border-primary/40 transition-colors ${hasRequestLowerContent ? 'flex-none' : 'flex-1 min-h-0 flex flex-col'}`}>
                <label className="text-[10px] font-bold text-muted-foreground mb-3 block uppercase tracking-widest">Task Description</label>
                <TaskSearchBox
                  onSearch={setQuery}
                  readOnly={isTaskInProgress}
                  expanded={!hasRequestLowerContent}
                />
              </div>

              <div className={`bg-white/[0.05] rounded-3xl p-6 border border-white/10 ${hasRequestLowerContent ? 'flex-none' : 'flex-1 min-h-0'}`}>
                <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-widest">Estimated Cost</label>
                <div className="flex justify-between items-end">
                  {selectedAgentId ? (
                    <input
                      type="text"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="text-5xl font-black text-white tracking-tighter bg-transparent border-none outline-none w-full animate-in fade-in slide-in-from-left-2"
                    />
                  ) : (
                    <div className="text-2xl font-bold text-white/20 tracking-tight h-[60px] flex items-center">
                      Search & Select Agent...
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 mb-1 flex-none">
                      <Image
                        src={networkLogo}
                        alt="Network Logo"
                        width={24}
                        height={24}
                        className="w-5 h-5 object-contain"
                      />
                      <span className="font-bold text-base text-white">{paymentTokenSymbol}</span>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground flex justify-between mt-2 font-medium h-4">
                  {selectedAgentId ? (
                    <>
                      <span>~ ${(parseFloat(paymentAmount) * 2500 || 0).toLocaleString()} USD</span>
                      <span>
                        Balance: {balance ? parseFloat(formatUnits(balance as bigint, paymentTokenDecimals)).toFixed(4) : '0.00'} {paymentTokenSymbol}
                      </span>
                    </>
                  ) : (
                    <span className="opacity-50 italic text-[9px]">Awaiting selection to calculate fees...</span>
                  )}
                </div>

                {selectedAgentId && (
                  <TaskConfigForm
                    paymentAmount={paymentAmount}
                    tokenSymbol={paymentTokenSymbol}
                    onDeadlineChange={setDeadline}
                    readOnly={isTaskInProgress}
                  />
                )}
              </div>
            </div>

            {activeTask && showTaskActions && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Task Actions</p>
                <TaskContestationActions
                  task={activeTask}
                  connectedAddress={address}
                  agentResponseWindowSec={agentResponseWindowSec}
                  disputeBondBps={disputeBondBps}
                  escrowTimingLoading={escrowTimingLoading}
                  onTaskUpdated={refreshActiveTask}
                />
              </div>
            )}

            {hasRequestLowerContent && (
              <div className="mt-8 flex-none space-y-3">
                {showCreateButton && (
                  <button
                    onClick={handleCreateTask}
                    disabled={!selectedAgentId || isCreating}
                    className={`w-full py-4 font-black text-lg rounded-2xl transition-all shadow-2xl ${
                      selectedAgentId && !isCreating
                        ? 'bg-primary hover:bg-primary/90 text-white shadow-primary/40 scale-[1.02]'
                        : 'bg-white/10 text-muted-foreground cursor-not-allowed border border-white/5'
                    }`}
                  >
                    {isCreating
                      ? 'Creating Task...'
                      : selectedAgentId
                        ? 'Create Task & Dispatch Agent'
                        : 'Select an Agent'}
                  </button>
                )}

                {activeTaskStatus !== null && TERMINAL_STATUSES.has(activeTaskStatus) && (
                  <p className="text-[11px] text-muted-foreground text-center">Task reached terminal status: {taskStatusLabel}</p>
                )}
              </div>
            )}
          </Card>

          <Card className="flex flex-col p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] h-full overflow-hidden relative">
            <div className="flex justify-between items-center mb-6 flex-none">
              <h3 className="text-2xl font-bold text-white tracking-tight">
                {showRecommendedAgents ? 'Recommended Agents' : 'Task Progress'}
              </h3>
              {showRecommendedAgents && isLoading && <RefreshCw className="animate-spin w-5 h-5 text-primary" />}
            </div>

            <div className="flex-1 pr-1 flex flex-col h-full min-h-0">
              <div className="flex-1 min-h-0">
                {!showRecommendedAgents && activeTaskId !== null ? (
                  <ExchangeTaskProgressPanel
                    activeTaskId={activeTaskId}
                    activeAgentRunId={activeAgentRunId}
                    taskStatusLabel={taskStatusLabel}
                    activeTask={activeTask}
                    paymentDeposited={paymentDeposited}
                    pollError={pollError}
                    agentResult={agentResult}
                    activeTaskDisputeMessage={activeTaskDisputeMessage}
                    selectedAgent={selectedAgent}
                    selectedAgentId={selectedAgentId}
                    showDepositPaymentButton={showDepositPaymentButton}
                    showNotifyPaymentButton={showNotifyPaymentButton}
                    isDepositing={isDepositing}
                    isNotifyingPayment={isNotifyingPayment}
                    onDepositPayment={() => {
                      void handleDepositPayment();
                    }}
                    onNotifyPayment={() => {
                      void handleNotifyPaymentDeposited(activeTaskId);
                    }}
                  />
                ) : isLoading ? (
                  <div className="flex-1 space-y-4 h-full">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-[30%] w-full rounded-3xl bg-white/5" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-4 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 text-center">
                    <p className="font-semibold text-sm">Unable to fetch agents.</p>
                  </div>
                ) : agents && agents.length > 0 ? (
                  <AgentRoutesList
                    agents={agents}
                    selectedId={selectedAgentId}
                    onSelect={setSelectedAgentId}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-40">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10 shadow-inner">
                      <SmartToyIcon className="w-10 h-10 text-primary" />
                    </div>
                    <h4 className="text-lg font-bold mb-2 text-white">No Task Entered</h4>
                    <p className="text-xs text-muted-foreground max-w-[200px] leading-relaxed">Enter your task on the left to match with AI agents.</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
