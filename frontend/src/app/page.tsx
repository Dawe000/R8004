'use client';
import { useState, useEffect } from 'react';
import { TaskSearchBox } from '@/components/TaskSearchBox';
import { AgentRoutesList } from '@/components/AgentRoutesList';
import { useAgentMatching } from '@/hooks/useAgentMatching';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Settings, RefreshCw, ArrowDown } from 'lucide-react';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import PsychologyIcon from '@mui/icons-material/Psychology';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ScienceIcon from '@mui/icons-material/Science';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import HubIcon from '@mui/icons-material/Hub';
import DarkVeil from '@/components/ui/DarkVeil';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAgentSDK } from '@/hooks/useAgentSDK';
import { MOCK_TOKEN_ADDRESS, ESCROW_ADDRESS } from '@/config/constants';
import { parseEther, formatEther } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { toast } from 'sonner';

export default function Home() {
  const { address } = useAccount();
  const [query, setQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('0.00');
  const [isCreating, setIsCreating] = useState(false);
  const { data: agents, isLoading, error } = useAgentMatching(query);
  const sdk = useAgentSDK();

  // Sync payment amount with selected agent's stake requirements
  useEffect(() => {
    if (selectedAgentId && agents) {
      const selectedAgent = agents.find(a => a.agent.agentId === selectedAgentId);
      if (selectedAgent?.agent.sla?.minAcceptanceStake) {
        const minStake = formatEther(selectedAgent.agent.sla.minAcceptanceStake);
        // We set the payment to be the same as the min stake for now, or a bit more
        setPaymentAmount(minStake);
      }
    }
  }, [selectedAgentId, agents]);

  // Fetch balance
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
    }
  });

  const handleCreateTask = async () => {
    if (!sdk || !query) return;
    setIsCreating(true);
    const toastId = toast.loading('Initializing task creation...');
    
    try {
      const amount = parseEther(paymentAmount);
      
      // 1. Check Allowance for TST tokens
      toast.loading('Checking token allowance...', { id: toastId });
      const { ensureAllowance } = await import('@sdk/index');
      await (await sdk.client.getTask(0n)); // Warm up
      
      // Note: ensureAllowance returns a transaction response if approval is needed
      const approvalTx = await ensureAllowance(
        MOCK_TOKEN_ADDRESS,
        (sdk.client as any).signer, // Access signer from SDK
        ESCROW_ADDRESS,
        amount
      );
      
      if (approvalTx) {
        toast.loading('Waiting for token approval...', { id: toastId });
        await approvalTx.wait();
        toast.success('Token approved!', { id: toastId });
      }

      // 2. Create task on-chain
      toast.loading('Creating task on-chain...', { id: toastId });
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const taskId = await sdk.client.createTask(
        query,
        MOCK_TOKEN_ADDRESS,
        amount,
        deadline
      );

      toast.success(`Task created (ID: ${taskId})! Waiting for agent to accept...`, { id: toastId });

      // Note: Payment will be deposited after agent accepts the task
      // The agent must call acceptTask() first, then client calls depositPayment()
      
    } catch (err: any) {
      console.error('Task creation failed:', err);
      let message = err.message || 'Unknown error';
      if (message.includes('user rejected')) {
        message = 'Transaction rejected by user.';
      } else if (message.includes('execution reverted')) {
        message = 'Transaction reverted. Do you have enough tokens?';
      }
      toast.error(`Error: ${message}`, { id: toastId });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="h-screen w-full bg-[#0a0a0f] text-foreground flex flex-col overflow-hidden relative">
      {/* Animated Background */}
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

      {/* Navbar */}
      <nav className="flex-none flex items-center justify-between py-4 px-8 border-b border-white/5 relative z-30 backdrop-blur-md bg-background/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <HubIcon className="text-white w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">EthOxford<span className="text-primary">Agents</span></span>
        </div>
        <div className="hidden md:flex gap-1 p-1 bg-white/5 rounded-full border border-white/10">
          <button className="px-4 py-1.5 rounded-full bg-white/10 text-white font-medium text-xs transition-all">Exchange</button>
          <button className="px-4 py-1.5 rounded-full hover:bg-white/5 text-muted-foreground font-medium text-xs transition-all">Portfolio</button>
        </div>
        <ConnectButton />
      </nav>

      {/* Main Content Container */}
      <div className="flex-1 w-full flex items-center justify-center relative z-20 p-4">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
          
          {/* Left Column: Task Input */}
          <Card className="flex flex-col p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] relative overflow-hidden h-full">
            <div className="flex justify-between items-center mb-6 flex-none">
              <h2 className="text-2xl font-bold tracking-tight text-white">Request Task</h2>
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Settings className="text-muted-foreground w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-3 relative min-h-0">
              <div className="bg-white/[0.05] rounded-3xl p-6 border border-white/10 hover:border-primary/40 transition-colors flex-1 flex flex-col">
                <label className="text-[10px] font-bold text-muted-foreground mb-3 block uppercase tracking-widest flex-none">Task Description</label>
                <div className="flex-1 min-h-0">
                  <TaskSearchBox onSearch={setQuery} />
                </div>
              </div>

              {/* Centered Arrow Button */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                <div className="bg-[#0a0a0f]/90 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-2xl">
                  <div className="bg-white/5 p-1 rounded text-primary">
                    <ArrowDown className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="bg-white/[0.05] rounded-3xl p-6 border border-white/10 flex-1 flex flex-col justify-center">
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
              </div>
            </div>

            <div className="mt-8 flex-none">
              <button 
                  onClick={handleCreateTask}
                  className={`w-full py-4 font-black text-lg rounded-2xl transition-all shadow-2xl ${
                    selectedAgentId 
                      ? 'bg-primary hover:bg-primary/90 text-white shadow-primary/40 scale-[1.02]' 
                      : 'bg-white/10 text-muted-foreground cursor-not-allowed border border-white/5'
                  }`}
              >
                {selectedAgentId ? 'Create Task & Escrow' : 'Select an Agent'}
              </button>
            </div>
          </Card>

          {/* Right Column: Agents Output */}
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
                  { icon: <AutoGraphIcon />, label: "Sentiment" },
                  { icon: <PsychologyIcon />, label: "Predict" },
                  { icon: <MonetizationOnIcon />, label: "Yield" },
                  { icon: <ScienceIcon />, label: "Research" }
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
