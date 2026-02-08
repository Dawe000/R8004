import { TaskStatus, type Task } from '@sdk/types';

export type DisputePhase =
  | 'none'
  | 'result_asserted_open'
  | 'result_asserted_closed'
  | 'disputed_waiting_agent'
  | 'disputed_settle_ready'
  | 'escalated_to_uma'
  | 'resolved_agent_won'
  | 'resolved_client_won'
  | 'resolved_timeout_or_failure';

function toBigInt(value: bigint | number): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function statusNumber(task: Task): number {
  return Number(task.status);
}

export function isTaskTerminal(task: Task): boolean {
  const status = statusNumber(task);
  return (
    status === TaskStatus.TimeoutCancelled
    || status === TaskStatus.AgentFailed
    || status === TaskStatus.Resolved
  );
}

export function getDisputePhase(
  task: Task,
  nowSec: bigint | number,
  agentResponseWindowSec: bigint | number
): DisputePhase {
  const status = statusNumber(task);
  const now = toBigInt(nowSec);
  const responseWindow = toBigInt(agentResponseWindowSec);

  if (status === TaskStatus.ResultAsserted) {
    return now < task.cooldownEndsAt
      ? 'result_asserted_open'
      : 'result_asserted_closed';
  }

  if (status === TaskStatus.DisputedAwaitingAgent) {
    const settleAt = task.cooldownEndsAt + responseWindow;
    return now < settleAt ? 'disputed_waiting_agent' : 'disputed_settle_ready';
  }

  if (status === TaskStatus.EscalatedToUMA) {
    return 'escalated_to_uma';
  }

  if (status === TaskStatus.Resolved) {
    if (task.umaAssertionId && task.umaAssertionId !== '0x' && task.umaAssertionId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      return task.umaResultTruth ? 'resolved_agent_won' : 'resolved_client_won';
    }
    return 'resolved_timeout_or_failure';
  }

  return 'none';
}

export function getDisputeStatusMessage(
  task: Task,
  nowSec: bigint | number,
  agentResponseWindowSec: bigint | number
): string {
  const phase = getDisputePhase(task, nowSec, agentResponseWindowSec);

  switch (phase) {
    case 'result_asserted_open':
      return 'Result asserted. Dispute window is open for the client.';
    case 'result_asserted_closed':
      return 'Result asserted. Dispute window is closed; task can be settled no-contest by agent cron.';
    case 'disputed_waiting_agent':
      return 'Task disputed. Waiting for agent response window; agent cron may auto-escalate with IPFS evidence.';
    case 'disputed_settle_ready':
      return 'Task disputed and agent response window expired. Client can settle as agent conceded.';
    case 'escalated_to_uma':
      return 'Dispute escalated to UMA. Awaiting oracle resolution.';
    case 'resolved_agent_won':
      return 'Resolved: UMA ruled in favor of the agent assertion.';
    case 'resolved_client_won':
      return 'Resolved: client won the dispute.';
    case 'resolved_timeout_or_failure':
      return 'Resolved via non-UMA path (timeout, concession, or failure handling).';
    default:
      return 'Task is not currently in dispute flow.';
  }
}
