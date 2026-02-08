'use client';

import DarkVeil from '@/components/ui/DarkVeil';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeft, Zap, Info, ShieldCheck, DollarSign } from 'lucide-react';

export default function PlasmaFlowPage() {
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
          <Link href="/fassets">
            <button className="px-4 py-1.5 rounded-full hover:bg-white/5 text-muted-foreground font-medium text-xs transition-all">FAssets Flow</button>
          </Link>
          <button className="px-4 py-1.5 rounded-full bg-[#162f29] text-[#4ade80] font-bold text-xs transition-all shadow-lg shadow-green-900/20">Plasma Flow</button>
        </div>
        <ConnectButton />
      </nav>

      {/* Main Content */}
      <div className="flex-1 w-full flex items-center justify-center relative z-20 p-4 overflow-hidden">
        <div className="w-full max-w-4xl h-[85%] overflow-y-auto custom-scrollbar pr-2">
          <Card className="p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-[#162f29] rounded-2xl text-[#4ade80]">
                <Zap className="w-6 h-6 fill-current" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Plasma USDT0 Model</h2>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="p-2 bg-white/5 rounded-lg h-fit mt-1"><DollarSign className="w-4 h-4 text-emerald-400" /></div>
                <div>
                  <h4 className="text-sm font-bold text-white">Price Stability</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">USDT0 is 1:1 backed with USD—no spike risk during multi-day tasks. Deterministic payment values eliminate volatility vs ETH/BTC.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="p-2 bg-white/5 rounded-lg h-fit mt-1"><ShieldCheck className="w-4 h-4 text-blue-400" /></div>
                <div>
                  <h4 className="text-sm font-bold text-white">Deterministic Payments</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">Agents know exact payout value upfront. Value won't fluctuate between task acceptance and settlement—critical for trustless escrow.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="p-2 bg-white/5 rounded-lg h-fit mt-1"><Info className="w-4 h-4 text-purple-400" /></div>
                <div>
                  <h4 className="text-sm font-bold text-white">Low Gas Fees</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">L1 efficiency without mainnet costs. EVM compatibility enables standard tooling—stablecoin standard familiar to global agents.</p>
                </div>
              </div>
            </div>

            <div className="mt-8 p-4 bg-black/40 rounded-2xl border border-white/5">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Plasma Testnet Contracts</h4>
              <div className="space-y-2 text-[9px] font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Escrow</span>
                  <a href="https://testnet.plasmascan.to/address/0xFf4e2165f2B30e3f7e25118148C3f7b53895F513" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                    0xFf4e...F513
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">USDT0 Token</span>
                  <a href="https://testnet.plasmascan.to/address/0x502012b361AebCE43b26Ec812B74D9a51dB4D412" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                    0x5020...D412
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Mock OOv3</span>
                  <a href="https://testnet.plasmascan.to/address/0x7Aa7562D8e62047fAfa185937C39436051565e73" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                    0x7Aa7...5e73
                  </a>
                </div>
              </div>
              <a href="https://github.com/Dawe000/R8004/tree/main/contracts/script/plasma" target="_blank" rel="noopener noreferrer" className="mt-3 block text-[9px] text-blue-400 hover:text-blue-300 transition-colors italic text-center">
                → Deployment Scripts & E2E Flows
              </a>
            </div>

            <Link href="/">
              <button className="mt-6 w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-white/10">
                <ArrowLeft className="w-4 h-4" /> Back to Terminal
              </button>
            </Link>
          </Card>
        </div>
      </div>
    </main>
  );
}
