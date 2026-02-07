'use client';
import { useState } from 'react';
import { TaskSearchBox } from '@/components/TaskSearchBox';
import { AgentRoutesList } from '@/components/AgentRoutesList';
import { useAgentMatching } from '@/hooks/useAgentMatching';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Settings, RefreshCw, ArrowDown } from 'lucide-react';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import PsychologyIcon from '@mui/icons-material/Psychology';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import ScienceIcon from '@mui/icons-material/Science';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import HubIcon from '@mui/icons-material/Hub';

export default function Home() {
  const [query, setQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const { data: agents, isLoading, error } = useAgentMatching(query);

  const handleCreateTask = () => {
    alert('Wallet connection needed for task creation (Phase 2)');
  };

  return (
    <main className="h-screen w-full bg-background text-foreground flex flex-col overflow-hidden">
      {/* Navbar - More compact */}
      <nav className="flex-none flex items-center justify-between py-4 px-8 border-b border-border/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <HubIcon className="text-white w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">EthOxford<span className="text-primary">Agents</span></span>
        </div>
        <div className="hidden md:flex gap-1 p-1 bg-secondary/30 rounded-full border border-border/50">
          <button className="px-4 py-1.5 rounded-full bg-secondary text-white font-medium text-xs shadow-sm transition-all">Exchange</button>
          <button className="px-4 py-1.5 rounded-full hover:bg-secondary/50 text-muted-foreground font-medium text-xs transition-all">Portfolio</button>
        </div>
        <button className="px-5 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-full font-semibold text-sm transition-all shadow-lg shadow-primary/20">
          Connect Wallet
        </button>
      </nav>

      {/* Main Content - Scaled Down */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-4 h-full max-h-[640px]">
          
          {/* Left Column: Task Input */}
          <Card className="flex flex-col p-6 bg-card border-none shadow-2xl rounded-[2rem] relative overflow-hidden h-full">
            <div className="flex justify-between items-center mb-4 flex-none">
              <h2 className="text-xl font-bold tracking-tight">Request Task</h2>
              <button className="p-1.5 hover:bg-secondary rounded-full transition-colors">
                <Settings className="text-muted-foreground w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-1.5 relative">
              <div className="bg-secondary/25 rounded-2xl p-4 border border-border/50 hover:border-primary/30 transition-colors flex-1 min-h-[120px]">
                <label className="text-[10px] font-bold text-muted-foreground mb-2 block uppercase tracking-widest">Task Description</label>
                <TaskSearchBox onSearch={setQuery} />
              </div>

              {/* Centered Arrow Button - Smaller */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                 <div className="bg-card p-1.5 rounded-lg border-2 border-background shadow-lg">
                   <div className="bg-secondary/50 p-1 rounded text-primary">
                     <ArrowDown className="w-4 h-4" />
                   </div>
                 </div>
              </div>

              <div className="bg-secondary/25 rounded-2xl p-4 border border-border/50 flex-1 min-h-[120px] flex flex-col justify-center">
                 <label className="text-[10px] font-bold text-muted-foreground mb-1 block uppercase tracking-widest">Estimated Cost</label>
                 <div className="flex justify-between items-end">
                   <input 
                      type="text" 
                      placeholder="0.00" 
                      className="bg-transparent border-none text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 focus:outline-none w-full" 
                      readOnly
                   />
                   <div className="flex items-center gap-1.5 bg-card px-2 py-1 rounded-full border border-border/50 mb-1.5">
                      <div className="w-5 h-5 bg-blue-500 rounded-full"></div>
                      <span className="font-bold text-sm">ETH</span>
                   </div>
                 </div>
                 <div className="text-[10px] text-muted-foreground flex justify-between">
                   <span>$0.00 USD</span>
                   <span>Balance: 0.00 ETH</span>
                 </div>
              </div>
            </div>

            <div className="mt-6 flex-none">
               <button 
                  onClick={handleCreateTask}
                  className={`w-full py-3.5 font-bold text-base rounded-xl transition-all shadow-lg ${
                    selectedAgentId 
                      ? 'bg-primary hover:bg-primary/90 text-white shadow-primary/20' 
                      : 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
                  }`}
               >
                 {selectedAgentId ? 'Create Task & Escrow' : 'Select an Agent'}
               </button>
            </div>
          </Card>

          {/* Right Column: Agents Output */}
          <Card className="flex flex-col p-6 bg-card border-none shadow-2xl rounded-[2rem] h-full overflow-hidden relative">
            <div className="flex justify-between items-center mb-4 flex-none">
              <h3 className="text-xl font-bold text-foreground">Recommended Agents</h3>
              {isLoading && <RefreshCw className="animate-spin w-4 h-4 text-primary" />}
            </div>

            {/* Added h-full and flex to container to allow children to fill space */}
            <div className="flex-1 overflow-hidden px-1 space-y-2 custom-scrollbar flex flex-col h-full">
              {isLoading && (
                <div className="flex-1 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-1/4 w-full rounded-2xl bg-secondary/30" />
                  ))}
                </div>
              )}

              {error && (
                <div className="p-4 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 text-center">
                  <p className="font-semibold text-sm">Unable to fetch agents.</p>
                </div>
              )}

              {agents && agents.length > 0 && (
                <AgentRoutesList 
                  agents={agents} 
                  selectedId={selectedAgentId} 
                  onSelect={setSelectedAgentId} 
                />
              )}

              {!query && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-50">
                  <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
                    <SmartToyIcon className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="text-base font-bold mb-1">No Task Entered</h4>
                  <p className="text-xs text-muted-foreground max-w-xs px-4">Describe your task on the left to match with AI agents.</p>
                </div>
              )}
            </div>
            
            {!query && !isLoading && (
              <div className="mt-auto pt-4 grid grid-cols-4 gap-1 flex-none border-t border-border/10">
                 {[
                   { icon: <AutoGraphIcon />, label: "Sentiment" },
                   { icon: <PsychologyIcon />, label: "Predict" },
                   { icon: <MonetizationOnIcon />, label: "Yield" },
                   { icon: <ScienceIcon />, label: "Research" }
                 ].map((cat, i) => (
                   <button key={i} className="flex flex-col items-center justify-center p-2 rounded-xl hover:bg-secondary/50 transition-colors gap-1 text-muted-foreground hover:text-primary">
                     <div className="scale-50">{cat.icon}</div>
                     <span className="text-[9px] font-bold uppercase tracking-tight">{cat.label}</span>
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