import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TaskStatus, type Task } from '@sdk/types';
import { getDisputePhase, getDisputeStatusMessage, isTaskTerminal } from '../src/lib/disputeFlow';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 99n,
    client: '0x1111111111111111111111111111111111111111',
    agent: '0x2222222222222222222222222222222222222222',
    paymentToken: '0x3333333333333333333333333333333333333333',
    stakeToken: '0x3333333333333333333333333333333333333333',
    paymentAmount: 1000n,
    agentStake: 50n,
    createdAt: 1000n,
    deadline: 4000n,
    cooldownEndsAt: 2000n,
    status: TaskStatus.ResultAsserted,
    resultHash: '0xabc',
    agentSignature: '0xdef',
    clientDisputeBond: 0n,
    agentEscalationBond: 0n,
    clientEvidenceURI: '',
    agentEvidenceURI: '',
    resultURI: '',
    umaAssertionId: '',
    umaResultTruth: false,
    ...overrides,
  };
}

describe('disputeFlow helpers', () => {
  it('detects result asserted open/closed phases', () => {
    const task = makeTask({ status: TaskStatus.ResultAsserted, cooldownEndsAt: 3000n });
    assert.equal(getDisputePhase(task, 2500n, 600n), 'result_asserted_open');
    assert.equal(getDisputePhase(task, 3000n, 600n), 'result_asserted_closed');
  });

  it('detects disputed waiting/settle-ready phases', () => {
    const task = makeTask({ status: TaskStatus.DisputedAwaitingAgent, cooldownEndsAt: 3000n });
    assert.equal(getDisputePhase(task, 3200n, 400n), 'disputed_waiting_agent');
    assert.equal(getDisputePhase(task, 3400n, 400n), 'disputed_settle_ready');
  });

  it('detects escalated and resolved winner phases', () => {
    const escalated = makeTask({
      status: TaskStatus.EscalatedToUMA,
      umaAssertionId: '0x' + '1'.repeat(64),
    });
    assert.equal(getDisputePhase(escalated, 1n, 1n), 'escalated_to_uma');

    const resolvedAgentWon = makeTask({
      status: TaskStatus.Resolved,
      umaAssertionId: '0x' + '2'.repeat(64),
      umaResultTruth: true,
    });
    assert.equal(getDisputePhase(resolvedAgentWon, 1n, 1n), 'resolved_agent_won');

    const resolvedClientWon = makeTask({
      status: TaskStatus.Resolved,
      umaAssertionId: '0x' + '3'.repeat(64),
      umaResultTruth: false,
    });
    assert.equal(getDisputePhase(resolvedClientWon, 1n, 1n), 'resolved_client_won');
  });

  it('identifies terminal states', () => {
    assert.equal(isTaskTerminal(makeTask({ status: TaskStatus.Resolved })), true);
    assert.equal(isTaskTerminal(makeTask({ status: TaskStatus.TimeoutCancelled })), true);
    assert.equal(isTaskTerminal(makeTask({ status: TaskStatus.AgentFailed })), true);
    assert.equal(isTaskTerminal(makeTask({ status: TaskStatus.Accepted })), false);
  });

  it('returns human-readable status messages', () => {
    const task = makeTask({ status: TaskStatus.DisputedAwaitingAgent, cooldownEndsAt: 2000n });
    const message = getDisputeStatusMessage(task, 2100n, 500n);
    assert.match(message, /waiting for agent response window/i);
  });
});
