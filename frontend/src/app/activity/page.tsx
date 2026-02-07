'use client';

import { TaskHistoryList } from '@/components/TaskHistoryList';
import DarkVeil from '@/components/ui/DarkVeil';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowLeft, Activity as ActivityIcon } from 'lucide-react';

export default function ActivityPage() {
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
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-16 h-16 relative"> 
              <Image 
                src="/R8004_logo.png" 
                alt="R8004 Logo" 
                fill 
                className="object-contain"
              />
            </div>
            <span className="text-4xl font-black tracking-tighter text-white">R8004</span>
          </Link>
        </div>
        <div className="hidden md:flex gap-1 p-1 bg-white/5 rounded-full border border-white/10">
          <Link href="/">
            <button className="px-4 py-1.5 rounded-full hover:bg-white/5 text-muted-foreground font-medium text-xs transition-all">Exchange</button>
          </Link>
          <button className="px-4 py-1.5 rounded-full bg-white/10 text-white font-medium text-xs transition-all">Activity</button>
        </div>
        <ConnectButton />
      </nav>

      {/* Main Content */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-20 p-4 overflow-hidden">
        <Card className="w-full max-w-3xl flex flex-col p-8 bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-[2.5rem] max-h-[85%] overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-2xl">
                <ActivityIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Your Activity</h2>
                <p className="text-sm text-muted-foreground">Every task interaction recorded on Plasma Testnet</p>
              </div>
            </div>
            <Link href="/">
              <button className="p-2 hover:bg-white/5 rounded-full transition-colors flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            <TaskHistoryList allTime={true} />
          </div>
        </Card>
      </div>
    </main>
  );
}