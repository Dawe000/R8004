'use client';

import type { ReactNode } from 'react';
import type { RankedAgent } from '@/lib/api/marketMaker';
import type { Task } from '@sdk/types';

interface ExchangeTaskProgressPanelProps {
  activeTaskId: bigint;
  activeAgentRunId: string | null;
  taskStatusLabel: string;
  activeTask: Task | null;
  paymentDeposited: boolean;
  pollError: string | null;
  agentResult: unknown;
  activeTaskDisputeMessage: string | null;
  selectedAgent: RankedAgent | null;
  selectedAgentId: string | null;
  showDepositPaymentButton: boolean;
  showNotifyPaymentButton: boolean;
  isDepositing: boolean;
  isNotifyingPayment: boolean;
  onDepositPayment: () => void;
  onNotifyPayment: () => void;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-muted-foreground">
      <span>{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}

export function ExchangeTaskProgressPanel({
  activeTaskId,
  activeAgentRunId,
  taskStatusLabel,
  activeTask,
  paymentDeposited,
  pollError,
  agentResult,
  activeTaskDisputeMessage,
  selectedAgent,
  selectedAgentId,
  showDepositPaymentButton,
  showNotifyPaymentButton,
  isDepositing,
  isNotifyingPayment,
  onDepositPayment,
  onNotifyPayment,
}: ExchangeTaskProgressPanelProps) {
  const fallbackAgentId = selectedAgentId ?? activeTask?.agent ?? null;
  const agentIdentifier = selectedAgent?.agent.agentId ?? fallbackAgentId;
  const agentAddress = activeTask?.agent;
  const isAgentPending = !agentAddress || agentAddress === ZERO_ADDRESS;
  const agentName = selectedAgent?.agent.name ?? 'Selected Agent';
  const avatarLabel = agentName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Selected Agent</p>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-black text-white">
              {avatarLabel}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{agentName}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {agentIdentifier
                  ? `${agentIdentifier.slice(0, 10)}...${agentIdentifier.slice(-6)}`
                  : 'Agent ID unavailable'}
              </p>
            </div>
          </div>
          <div className="text-right">
            {selectedAgent ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  Match {(selectedAgent.score * 100).toFixed(0)}%
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-success">
                  Trust {(selectedAgent.trustScore * 100).toFixed(0)}%
                </p>
              </>
            ) : (
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Context only</p>
            )}
          </div>
        </div>
      </div>

      {(showDepositPaymentButton || showNotifyPaymentButton) && (
        <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-200/80">
            Execution Actions
          </p>
          <div className="space-y-2">
            {showDepositPaymentButton && (
              <button
                onClick={onDepositPayment}
                disabled={isDepositing}
                className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-black transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDepositing ? 'Depositing Payment...' : 'Deposit Payment (Manual Step)'}
              </button>
            )}
            {showNotifyPaymentButton && (
              <button
                onClick={onNotifyPayment}
                disabled={isNotifyingPayment}
                className="w-full rounded-xl bg-cyan-400 py-3 text-sm font-bold text-black transition-all hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isNotifyingPayment ? 'Notifying Agent...' : 'Notify Agent Payment Deposited'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs">
          <DataRow label="On-chain Task ID" value={<span className="font-mono">{activeTaskId.toString()}</span>} />
          <DataRow label="Agent Run ID" value={activeAgentRunId ? <span className="font-mono">{activeAgentRunId}</span> : '-'} />
          <DataRow label="Status" value={taskStatusLabel} />
          <DataRow
            label="Client"
            value={activeTask ? <span className="font-mono">{shortAddress(activeTask.client)}</span> : 'Waiting...'}
          />
          <DataRow
            label="Agent"
            value={activeTask
              ? (
                  <span className="font-mono">
                    {isAgentPending ? 'Waiting...' : shortAddress(activeTask.agent)}
                  </span>
                )
              : 'Waiting...'}
          />
          <DataRow
            label="Payment Deposited"
            value={<span className={paymentDeposited ? 'text-green-400' : 'text-yellow-300'}>{paymentDeposited ? 'Yes' : 'No'}</span>}
          />
          <div className="text-muted-foreground">
            <p>Result URI</p>
            <p className="break-all text-white">{activeTask?.resultURI || 'Pending...'}</p>
          </div>
          {activeTaskDisputeMessage && (
            <p className="rounded-xl border border-orange-300/20 bg-orange-300/5 p-3 text-[10px] text-orange-200/80">
              {activeTaskDisputeMessage}
            </p>
          )}
          {pollError && <p className="text-destructive">Polling error: {pollError}</p>}
          {agentResult !== null && (
            <pre className="max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] text-slate-200">
              {typeof agentResult === 'string'
                ? agentResult
                : JSON.stringify(agentResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
