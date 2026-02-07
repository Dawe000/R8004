'use client';

import { useEffect, useMemo, useState } from 'react';
import { TaskSearchBox } from '@/components/TaskSearchBox';
import { AgentRoutesList } from '@/components/AgentRoutesList';
import { TaskConfigForm } from '@/components/TaskConfigForm';
import { useAgentMatching } from '@/hooks/useAgentMatching';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Settings, RefreshCw, ArrowDown } from 'lucide-react';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import PsychologyIcon from '@mui/icons-material/Psychology';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ScienceIcon from '@mui/icons-material/Science';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import DarkVeil from '@/components/ui/DarkVeil';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import { MOCK_TOKEN_ADDRESS } from '@/config/constants';
import { dispatchErc8001Task } from '@/lib/api/marketMaker';
import { formatEther, parseEther } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { toast } from 'sonner';

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

const TERMINAL_STATUSES = new Set<number>([6, 7, 8]);

export default function Home() {
  const { address } = useAccount();
  const [query, setQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('0.00');
  const [deadline, setDeadline] = useState(Math.floor(Date.now() / 1000) + 3600);
  const [isCreating, setIsCreating] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);

  const [activeTaskId, setActiveTaskId] = useState<bigint | null>(null);
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const [activeTaskStatus, setActiveTaskStatus] = useState<number | null>(null);
  const [activeTaskResultUri, setActiveTaskResultUri] = useState<string | null>(null);
  const [paymentDeposited, setPaymentDeposited] = useState(false);
  const [agentResult, setAgentResult] = useState<unknown>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const { data: agents, isLoading, error } = useAgentMatching(query);
  const sdk = useAgentSDK();

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId || !agents) return null;
    return agents.find((agent) => agent.agent.agentId === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgent?.agent.sla?.minAcceptanceStake) return;
    const minStake = formatEther(selectedAgent.agent.sla.minAcceptanceStake);
    setPaymentAmount(minStake);
  }, [selectedAgent]);

  const { data: balance } = useReadContract({
    address: MOCK_TOKEN_ADDRESS as `0x${string}`,
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

  useEffect(() => {
    if (!sdk || activeTaskId === null) return;

    let cancelled = false;

    const pollTask = async () => {
      try {
        const task = await sdk.client.getTask(activeTaskId);
        if (cancelled) return;

        const status = Number(task.status);
        setActiveTaskStatus(status);
        setActiveTaskResultUri(task.resultURI || null);

        const deposited = await sdk.client.getPaymentDeposited(activeTaskId);
        if (cancelled) return;
        setPaymentDeposited(Boolean(deposited));
        setPollError(null);

        if (!agentResult && task.resultURI && status >= 3) {
          const response = await fetch(task.resultURI);
          if (!response.ok) {
            throw new Error(`Failed to fetch result URI (${response.status})`);
          }
          const text = await response.text();
          try {
            setAgentResult(JSON.parse(text));
          } catch {
            setAgentResult(text);
          }
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
  }, [sdk, activeTaskId, agentResult]);

  const handleCreateTask = async () => {
    if (!sdk || !query || !selectedAgent) return;

    setIsCreating(true);
    const toastId = toast.loading('Creating task intent on-chain...');

    try {
      if (!selectedAgent.agent.sla?.minAcceptanceStake) {
        throw new Error('Selected agent is missing minAcceptanceStake');
      }

      const amount = parseEther(paymentAmount);

      const taskId = await sdk.client.createTask(
        query,
        MOCK_TOKEN_ADDRESS,
        amount,
        deadline
      );

      toast.loading('Dispatching to selected agent via marketmaker...', { id: toastId });

      const dispatchResult = await dispatchErc8001Task({
        agentId: selectedAgent.agent.agentId,
        onchainTaskId: taskId.toString(),
        input: query,
        stakeAmountWei: selectedAgent.agent.sla.minAcceptanceStake,
        skill: selectedAgent.agent.skills?.[0]?.id,
      });

      setActiveTaskId(taskId);
      setActiveAgentRunId(dispatchResult.runId);
      setActiveTaskStatus(1);
      setActiveTaskResultUri(null);
      setPaymentDeposited(false);
      setAgentResult(null);
      setPollError(null);

      if (typeof window !== 'undefined') {
        const savedTasks = JSON.parse(localStorage.getItem('r8004_tasks') || '[]');
        localStorage.setItem('r8004_tasks', JSON.stringify([...savedTasks, taskId.toString()]));
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

  const handleDepositPayment = async () => {
    if (!sdk || activeTaskId === null) return;

    setIsDepositing(true);
    const toastId = toast.loading(`Depositing payment for task ${activeTaskId.toString()}...`);

    try {
      await sdk.client.depositPayment(activeTaskId);
      setPaymentDeposited(true);
      toast.success('Payment deposited. Agent can now execute and assert completion.', { id: toastId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Deposit failed: ${message}`, { id: toastId });
    } finally {
      setIsDepositing(false);
    }
  };

  const taskStatusLabel = activeTaskStatus === null
    ? 'No Active Task'
    : TASK_STATUS_LABELS[activeTaskStatus] || `Unknown (${activeTaskStatus})`;

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
        </div>
        <ConnectButton />
      </nav>

      <div className="flex-1 w-full flex items-center justify-center relative z-20 p-4">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
          <Card className="flex flex-col p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] relative overflow-hidden h-full">
            <div className="flex justify-between items-center mb-6 flex-none">
              <h2 className="text-2xl font-bold tracking-tight text-white">Request Task</h2>
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Settings className="text-muted-foreground w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-3 relative min-h-0 overflow-y-auto pr-2">
              <div className="bg-white/[0.05] rounded-3xl p-6 border border-white/10 hover:border-primary/40 transition-colors flex-none">
                <label className="text-[10px] font-bold text-muted-foreground mb-3 block uppercase tracking-widest">Task Description</label>
                <TaskSearchBox onSearch={setQuery} />
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                <div className="bg-[#0a0a0f]/90 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-2xl">
                  <div className="bg-white/5 p-1 rounded text-primary">
                    <ArrowDown className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="bg-white/[0.05] rounded-3xl p-6 border border-white/10 flex-none">
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
                      src="/chain-light.svg"
                      alt="Network Logo"
                      width={24}
                      height={24}
                      className="w-5 h-5 object-contain"
                    />
                    <span className="font-bold text-base text-white">XPL</span>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground flex justify-between mt-2 font-medium h-4">
                  {selectedAgentId ? (
                    <>
                      <span>~ ${(parseFloat(paymentAmount) * 2500 || 0).toLocaleString()} USD</span>
                      <span>Balance: {balance ? parseFloat(formatEther(balance as bigint)).toFixed(4) : '0.00'} TST</span>
                    </>
                  ) : (
                    <span className="opacity-50 italic text-[9px]">Awaiting selection to calculate fees...</span>
                  )}
                </div>

                {selectedAgentId && (
                  <TaskConfigForm
                    paymentAmount={paymentAmount}
                    onDeadlineChange={setDeadline}
                  />
                )}
              </div>
            </div>

            {activeTaskId !== null && (
              <div className="mt-4 p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-xs space-y-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>On-chain Task ID</span>
                  <span className="font-mono text-white">{activeTaskId.toString()}</span>
                </div>
                {activeAgentRunId && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Agent Run ID</span>
                    <span className="font-mono text-white">{activeAgentRunId}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Status</span>
                  <span className="text-white">{taskStatusLabel}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Payment Deposited</span>
                  <span className={paymentDeposited ? 'text-green-400' : 'text-yellow-300'}>
                    {paymentDeposited ? 'Yes' : 'No'}
                  </span>
                </div>
                {activeTaskResultUri && (
                  <div className="break-all text-muted-foreground">
                    <span>Result URI: </span>
                    <span className="text-white">{activeTaskResultUri}</span>
                  </div>
                )}
                {pollError && <p className="text-destructive">Polling error: {pollError}</p>}
                {agentResult !== null && (
                  <pre className="max-h-28 overflow-y-auto bg-black/30 border border-white/10 rounded-lg p-2 text-[10px] text-slate-200">
                    {typeof agentResult === 'string'
                      ? agentResult
                      : JSON.stringify(agentResult, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="mt-8 flex-none space-y-3">
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

              {activeTaskId !== null && activeTaskStatus === 2 && !paymentDeposited && (
                <button
                  onClick={handleDepositPayment}
                  disabled={isDepositing}
                  className="w-full py-3 font-bold text-sm rounded-2xl transition-all bg-emerald-500 hover:bg-emerald-400 text-black"
                >
                  {isDepositing ? 'Depositing Payment...' : 'Deposit Payment (Manual Step)'}
                </button>
              )}

              {activeTaskStatus !== null && TERMINAL_STATUSES.has(activeTaskStatus) && (
                <p className="text-[11px] text-muted-foreground text-center">Task reached terminal status: {taskStatusLabel}</p>
              )}
            </div>
          </Card>

          <Card className="flex flex-col p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] h-full overflow-hidden relative">
            <div className="flex justify-between items-center mb-6 flex-none">
              <h3 className="text-2xl font-bold text-white tracking-tight">Recommended Agents</h3>
              {isLoading && <RefreshCw className="animate-spin w-5 h-5 text-primary" />}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col h-full min-h-0 custom-scrollbar">
              <div className="flex-1 min-h-0">
                {isLoading ? (
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

            {!query && !isLoading && (
              <div className="mt-auto pt-6 grid grid-cols-4 gap-2 flex-none border-t border-white/10">
                {[
                  { icon: <AutoGraphIcon />, label: 'Sentiment' },
                  { icon: <PsychologyIcon />, label: 'Predict' },
                  { icon: <MonetizationOnIcon />, label: 'Yield' },
                  { icon: <ScienceIcon />, label: 'Research' },
                ].map((cat, i) => (
                  <button key={i} className="flex flex-col items-center justify-center p-2 rounded-2xl hover:bg-white/10 transition-colors gap-2 text-muted-foreground hover:text-primary group">
                    <div className="scale-75 group-hover:scale-100 transition-transform">{cat.icon}</div>
                    <span className="text-[10px] font-bold uppercase tracking-tight">{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
