import { TaskStatus, type Task } from '@sdk/types';
import { isLikelyUri } from '@sdk/index';

function taskStatus(task: Task): number {
  return Number(task.status);
}

function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function toBigInt(value: bigint | number): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function clampSeconds(seconds: bigint): number {
  if (seconds <= 0n) return 0;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(seconds > max ? max : seconds);
}

export interface ContestationTiming {
  mode: 'dispute_window' | 'awaiting_agent_response' | 'ready_to_settle_conceded' | 'not_contestable';
  label: string;
  secondsRemaining: number | null;
  deadlineUnix: bigint | null;
}

export interface ContestationEligibility {
  enabled: boolean;
  reason: string | null;
}

export function canClientDispute(
  task: Task,
  nowSec: bigint | number,
  connectedAddress?: string | null
): boolean {
  if (!sameAddress(task.client, connectedAddress)) return false;
  if (taskStatus(task) !== TaskStatus.ResultAsserted) return false;
  return toBigInt(nowSec) < task.cooldownEndsAt;
}

export function canClientSettleConceded(
  task: Task,
  nowSec: bigint | number,
  agentResponseWindowSec: bigint | number,
  connectedAddress?: string | null
): boolean {
  if (!sameAddress(task.client, connectedAddress)) return false;
  if (taskStatus(task) !== TaskStatus.DisputedAwaitingAgent) return false;
  const settleAt = task.cooldownEndsAt + toBigInt(agentResponseWindowSec);
  return toBigInt(nowSec) >= settleAt;
}

export function getContestationTiming(
  task: Task,
  nowSec: bigint | number,
  agentResponseWindowSec: bigint | number
): ContestationTiming {
  const now = toBigInt(nowSec);

  const status = taskStatus(task);

  if (status === TaskStatus.ResultAsserted) {
    const remaining = task.cooldownEndsAt - now;
    if (remaining > 0n) {
      return {
        mode: 'dispute_window',
        label: 'Dispute window is open',
        secondsRemaining: clampSeconds(remaining),
        deadlineUnix: task.cooldownEndsAt,
      };
    }
    return {
      mode: 'not_contestable',
      label: 'Dispute window has closed',
      secondsRemaining: 0,
      deadlineUnix: task.cooldownEndsAt,
    };
  }

  if (status === TaskStatus.DisputedAwaitingAgent) {
    const settleAt = task.cooldownEndsAt + toBigInt(agentResponseWindowSec);
    const remaining = settleAt - now;

    if (remaining > 0n) {
      return {
        mode: 'awaiting_agent_response',
        label: 'Waiting for agent escalation window to end',
        secondsRemaining: clampSeconds(remaining),
        deadlineUnix: settleAt,
      };
    }

    return {
      mode: 'ready_to_settle_conceded',
      label: 'Agent response window ended. You can settle now.',
      secondsRemaining: 0,
      deadlineUnix: settleAt,
    };
  }

  return {
    mode: 'not_contestable',
    label: 'Task is not in a contestable state',
    secondsRemaining: null,
    deadlineUnix: null,
  };
}

export function getDisputeEligibility(
  task: Task,
  nowSec: bigint | number,
  connectedAddress?: string | null,
  evidenceUri?: string | null
): ContestationEligibility {
  if (!sameAddress(task.client, connectedAddress)) {
    return {
      enabled: false,
      reason: 'Connect with the task client wallet to dispute.',
    };
  }

  if (taskStatus(task) !== TaskStatus.ResultAsserted) {
    return {
      enabled: false,
      reason: 'Dispute is only available while task is Result Asserted.',
    };
  }

  const timing = getContestationTiming(task, nowSec, 0n);
  if (!canClientDispute(task, nowSec, connectedAddress)) {
    return {
      enabled: false,
      reason: timing.label,
    };
  }

  const trimmedEvidenceUri = evidenceUri?.trim() ?? '';
  if (!trimmedEvidenceUri || !isLikelyUri(trimmedEvidenceUri)) {
    return {
      enabled: false,
      reason: 'Provide a valid evidence URI (ipfs://, https://, http://, ar://) before disputing.',
    };
  }

  return {
    enabled: true,
    reason: null,
  };
}

export function getSettleEligibility(
  task: Task,
  nowSec: bigint | number,
  agentResponseWindowSec: bigint | number | null,
  connectedAddress?: string | null,
  escrowTimingLoading = true
): ContestationEligibility {
  if (!sameAddress(task.client, connectedAddress)) {
    return {
      enabled: false,
      reason: 'Connect with the task client wallet to settle.',
    };
  }

  if (agentResponseWindowSec === null) {
    return {
      enabled: false,
      reason: escrowTimingLoading
        ? 'Loading escrow timing...'
        : 'Escrow timing unavailable. Check RPC connectivity and refresh.',
    };
  }

  if (taskStatus(task) !== TaskStatus.DisputedAwaitingAgent) {
    return {
      enabled: false,
      reason: 'Settle Agent Conceded is only available while task is Disputed Awaiting Agent.',
    };
  }

  const timing = getContestationTiming(task, nowSec, agentResponseWindowSec);
  if (!canClientSettleConceded(task, nowSec, agentResponseWindowSec, connectedAddress)) {
    return {
      enabled: false,
      reason: timing.label,
    };
  }

  return {
    enabled: true,
    reason: null,
  };
}
