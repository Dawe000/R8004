'use client';

import Mermaid from '@/components/ui/Mermaid';
import DarkVeil from '@/components/ui/DarkVeil';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeft, Zap, Info, ShieldCheck } from 'lucide-react';

const EXTENDED_FLARE_CHART = `
sequenceDiagram
    participant U as User (Client)
    participant A as Agent
    participant F as FAssets System
    participant V as yFXRP Vault
    participant E as Escrow
    
    Note over U,F: 1. Native Asset Bridging
    U->>F: Provide BTC/XRP/DOGE
    F->>U: Mint FXRP (Native on Flare)
    
    Note over A,V: 2. Capital Efficiency
    A->>V: Deposit FXRP
    V->>A: Receive yFXRP Shares
    Note over V: Earns 5-10% Base Yield
    
    Note over U,E: 3. Intent Creation
    U->>E: Create Task (Funding: FXRP)
    
    Note over A,E: 4. Secure Staking
    A->>E: acceptTask(Stake: yFXRP)
    Note over E: Yield accrues to Agent while locked
    
    Note over A: 5. Execution (TEE/Off-chain)
    A->>E: assertResult(Result Hash)
    
    Note over E: 6. Dispute Window & Settlement
    E->>A: Release Stake + Payment (FXRP)
    
    Note over A,V: 7. Redemption
    A->>V: Redeem yFXRP
    V->>A: FXRP (Principal + Accumulated Yield)
`;

export default function FAssetsFlowPage() {
  return (
    <main className="h-screen w-full bg-[#0a0a0f] text-foreground flex flex-col overflow-hidden relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-60">
        <DarkVeil speed={0.2} />
      </div>

      {/* Navbar */}
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
          <Link href="/">
            <button className="px-4 py-1.5 rounded-full hover:bg-white/5 text-muted-foreground font-medium text-xs transition-all">Exchange</button>
          </Link>
          <Link href="/activity">
            <button className="px-4 py-1.5 rounded-full hover:bg-white/5 text-muted-foreground font-medium text-xs transition-all">Activity</button>
          </Link>
          <Link href="/plasma">
            <button className="px-4 py-1.5 rounded-full hover:bg-[#162f29]/20 text-muted-foreground hover:text-[#4ade80] font-bold text-xs transition-all">Plasma Flow</button>
          </Link>
          <button className="px-4 py-1.5 rounded-full bg-[#fbcfe8] text-[#be185d] font-bold text-xs transition-all shadow-lg shadow-pink-500/20">FAssets Flow</button>
        </div>
        <ConnectButton />
      </nav>

      {/* Main Content */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-20 p-4 overflow-hidden">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8 h-[85%]">
          
          {/* Left Column: Legend & Info */}
          <div className="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
            <Card className="p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-pink-500/20 rounded-2xl text-pink-400">
                  <Zap className="w-6 h-6 fill-current" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">FAssets Yield Model</h2>
              </div>
              
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="p-2 bg-white/5 rounded-lg h-fit mt-1"><ShieldCheck className="w-4 h-4 text-emerald-400" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Capital Efficiency</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">Agents stake yFXRP shares earning 5-10% APY during task execution—productive collateral vs idle stakes. Zero opportunity cost for security.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="p-2 bg-white/5 rounded-lg h-fit mt-1"><Info className="w-4 h-4 text-blue-400" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white">yFXRP Mechanism</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">XRPL assets bridged via Flare's enshrined FAssets protocol as FXRP. Wrapped into ERC-4626 yFXRP vault shares for yield-bearing agent stakes.</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 bg-black/40 rounded-2xl border border-white/5">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Coston2 Testnet Contracts</h4>
                <div className="space-y-2 text-[9px] font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Escrow</span>
                    <a href="https://coston2-explorer.flare.network/address/0x5CA6175c0a5ec4ce61416E49fe69e3B91B4Ba310" target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 transition-colors">
                      0x5CA6...a310
                    </a>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">FXRP Token</span>
                    <a href="https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7" target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 transition-colors">
                      0x0b6A...3dc7
                    </a>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">yFXRP Vault</span>
                    <a href="https://coston2-explorer.flare.network/address/0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B" target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 transition-colors">
                      0x91Bf...E40B
                    </a>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Mock OOv3</span>
                    <a href="https://coston2-explorer.flare.network/address/0xdA085435a4a74e15e6CbF6dc3c9F89E9D6aD1C27" target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 transition-colors">
                      0xdA08...1C27
                    </a>
                  </div>
                </div>
                <a href="https://github.com/Dawe000/R8004/tree/main/contracts/script/flare" target="_blank" rel="noopener noreferrer" className="mt-3 block text-[9px] text-blue-400 hover:text-blue-300 transition-colors italic text-center">
                  → Deployment Scripts & Details
                </a>
              </div>

              <Link href="/">
                <button className="mt-6 w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/10">
                  <ArrowLeft className="w-4 h-4" /> Back to Terminal
                </button>
              </Link>
            </Card>
          </div>

          {/* Right Columns: Diagram */}
          <Card className="lg:col-span-2 p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto custom-scrollbar bg-black/40 rounded-3xl border border-white/5 p-8 flex flex-col items-center">
              <div className="min-w-[600px] w-full max-w-2xl py-4">
                <Mermaid chart={EXTENDED_FLARE_CHART} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
