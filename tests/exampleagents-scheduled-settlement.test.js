import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import workerModule, {
  runScheduledCron,
  runScheduledSettlementsWithSdk,
} from '../exampleagents/example-agents-worker.js';
import { TaskStatus } from '../sdk/src/types.ts';

function makeTask(overrides = {}) {
  return {
    id: 1n,
    client: '0x0000000000000000000000000000000000000001',
    agent: '0x0000000000000000000000000000000000000002',
    paymentToken: '0x0000000000000000000000000000000000000003',
    paymentAmount: 1n,
    agentStake: 1n,
    createdAt: 0n,
    deadline: 0n,
    cooldownEndsAt: 0n,
    status: TaskStatus.ResultAsserted,
    resultHash: '0x' + '0'.repeat(64),
    agentSignature: '0x',
    clientDisputeBond: 0n,
    agentEscalationBond: 0n,
    clientEvidenceURI: '',
    agentEvidenceURI: '',
    resultURI: '',
    umaAssertionId: '0x' + '0'.repeat(64),
    umaResultTruth: false,
    ...overrides,
  };
}

describe('exampleagents scheduled cron routing', () => {
  it('runs cleanup flow on cleanup cron', async () => {
    let cleanupCalled = 0;
    let settlementCalled = 0;

    const result = await runScheduledCron(
      { cron: '0 */6 * * *' },
      {},
      {
        cleanupExpiredTasksFn: async () => {
          cleanupCalled += 1;
          return 7;
        },
        runScheduledSettlementsFn: async () => {
          settlementCalled += 1;
          return {};
        },
      }
    );

    assert.equal(cleanupCalled, 1);
    assert.equal(settlementCalled, 0);
    assert.deepEqual(result, { mode: 'cleanup', deleted: 7 });
  });

  it('runs settlement flow on settlement cron', async () => {
    let cleanupCalled = 0;
    let settlementCalled = 0;

    const summary = {
      checked: 2,
      eligible: 1,
      settled: 1,
      failed: 0,
      skipped: 1,
      failedTasks: [],
    };

    const result = await runScheduledCron(
      { cron: '*/5 * * * *' },
      {},
      {
        cleanupExpiredTasksFn: async () => {
          cleanupCalled += 1;
          return 0;
        },
        runScheduledSettlementsFn: async () => {
          settlementCalled += 1;
          return summary;
        },
      }
    );

    assert.equal(cleanupCalled, 0);
    assert.equal(settlementCalled, 1);
    assert.deepEqual(result, { mode: 'settlement', summary });
  });
});

describe('exampleagents settlement helper', () => {
  it('settles eligible no-contest tasks and isolates per-task failures', async () => {
    const settledIds = [];
    const tasks = [
      makeTask({
        id: 11n,
        status: TaskStatus.ResultAsserted,
        cooldownEndsAt: 900n,
      }),
      makeTask({
        id: 12n,
        status: TaskStatus.DisputedAwaitingAgent,
        cooldownEndsAt: 100n,
      }),
      makeTask({
        id: 13n,
        status: TaskStatus.ResultAsserted,
        cooldownEndsAt: 850n,
      }),
    ];

    const sdk = {
      async getTasksNeedingAction() {
        return tasks;
      },
      async settleNoContest(taskId) {
        settledIds.push(taskId);
        if (taskId === 13n) {
          throw new Error('simulated settle failure');
        }
      },
    };

    const provider = {
      async getBlock(tag) {
        assert.equal(tag, 'latest');
        return { timestamp: 1000 };
      },
    };

    const summary = await runScheduledSettlementsWithSdk({
      sdk,
      provider,
      address: '0x0000000000000000000000000000000000000002',
      logger: { log() {} },
    });

    assert.deepEqual(settledIds, [11n, 13n]);
    assert.equal(summary.checked, 3);
    assert.equal(summary.eligible, 2);
    assert.equal(summary.settled, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.failedTasks.length, 1);
    assert.equal(summary.failedTasks[0].taskId, '13');
    assert.match(summary.failedTasks[0].reason, /simulated settle failure/);
  });
});

describe('exampleagents module exports', () => {
  it('still exports default worker with scheduled handler', () => {
    assert.equal(typeof workerModule.fetch, 'function');
    assert.equal(typeof workerModule.scheduled, 'function');
  });
});
