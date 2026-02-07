import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TaskStatus, type Task } from '@sdk/types';
import {
  canClientDispute,
  canClientSettleConceded,
  getContestationTiming,
  getDisputeEligibility,
  getSettleEligibility,
} from '../src/lib/contestation';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 42n,
    client: '0x1111111111111111111111111111111111111111',
    agent: '0x2222222222222222222222222222222222222222',
    paymentToken: '0x3333333333333333333333333333333333333333',
    stakeToken: '0x3333333333333333333333333333333333333333',
    paymentAmount: 1_000_000_000_000_000_000n,
    agentStake: 100_000_000_000_000_000n,
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

describe('contestation helpers', () => {
  it('enables dispute for client during cooldown with valid URI', () => {
    const task = makeTask();
    const eligibility = getDisputeEligibility(
      task,
      1500n,
      '0x1111111111111111111111111111111111111111',
      'ipfs://bafybeigdyrztst'
    );

    assert.equal(eligibility.enabled, true);
    assert.equal(eligibility.reason, null);
    assert.equal(canClientDispute(task, 1500n, task.client), true);
  });

  it('blocks dispute with invalid URI and provides deterministic reason', () => {
    const task = makeTask();
    const eligibility = getDisputeEligibility(task, 1500n, task.client, 'not-a-uri');

    assert.equal(eligibility.enabled, false);
    assert.match(eligibility.reason ?? '', /valid evidence URI/i);
  });

  it('blocks dispute and settle for non-client wallet', () => {
    const disputedTask = makeTask({ status: TaskStatus.DisputedAwaitingAgent });
    const disputeEligibility = getDisputeEligibility(disputedTask, 1500n, '0x9999999999999999999999999999999999999999', 'ipfs://x');
    const settleEligibility = getSettleEligibility(disputedTask, 2500n, 300n, '0x9999999999999999999999999999999999999999');

    assert.equal(disputeEligibility.enabled, false);
    assert.match(disputeEligibility.reason ?? '', /task client wallet/i);
    assert.equal(settleEligibility.enabled, false);
    assert.match(settleEligibility.reason ?? '', /task client wallet/i);
  });

  it('blocks settle before agent response window expires and enables after', () => {
    const disputedTask = makeTask({ status: TaskStatus.DisputedAwaitingAgent, cooldownEndsAt: 2000n });
    const before = getSettleEligibility(disputedTask, 2200n, 500n, disputedTask.client);
    const after = getSettleEligibility(disputedTask, 2600n, 500n, disputedTask.client);

    assert.equal(before.enabled, false);
    assert.match(before.reason ?? '', /waiting for agent escalation window to end/i);
    assert.equal(after.enabled, true);
    assert.equal(after.reason, null);
    assert.equal(canClientSettleConceded(disputedTask, 2600n, 500n, disputedTask.client), true);
  });

  it('provides clear settle reason while escrow timing is loading', () => {
    const disputedTask = makeTask({ status: TaskStatus.DisputedAwaitingAgent });
    const eligibility = getSettleEligibility(disputedTask, 2200n, null, disputedTask.client);

    assert.equal(eligibility.enabled, false);
    assert.equal(eligibility.reason, 'Loading escrow timing...');
  });

  it('reports timing deadline for disputed tasks', () => {
    const disputedTask = makeTask({ status: TaskStatus.DisputedAwaitingAgent, cooldownEndsAt: 2000n });
    const timing = getContestationTiming(disputedTask, 2100n, 500n);

    assert.equal(timing.mode, 'awaiting_agent_response');
    assert.equal(timing.deadlineUnix, 2500n);
    assert.equal(timing.secondsRemaining, 400);
  });
});
