import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import workerModule, {
  runScheduledCron,
  runDisputeEscalationForTask,
  runScheduledSettlements,
  runScheduledSettlementsWithSdk,
} from '../exampleagents/example-agents-worker.js';
import { calculateResultHash } from '../sdk/src/crypto.ts';
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
        status: TaskStatus.Accepted,
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
    assert.equal(summary.settleEligible, 2);
    assert.equal(summary.escalateEligible, 0);
    assert.equal(summary.settled, 1);
    assert.equal(summary.escalated, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.failedTasks.length, 1);
    assert.equal(summary.failedTasks[0].taskId, '13');
    assert.equal(summary.failedTasks[0].action, 'settleNoContest');
    assert.match(summary.failedTasks[0].reason, /simulated settle failure/);
  });

  it('escalates disputed tasks via injected escalation handler', async () => {
    const tasks = [
      makeTask({
        id: 21n,
        status: TaskStatus.DisputedAwaitingAgent,
        resultHash: '0x' + '1'.repeat(64),
      }),
    ];

    const sdk = {
      async getTasksNeedingAction() {
        return tasks;
      },
      async settleNoContest() {
        throw new Error('settleNoContest should not be called for disputed tasks');
      },
    };

    const provider = {
      async getBlock(tag) {
        assert.equal(tag, 'latest');
        return { timestamp: 1000 };
      },
    };

    const escalationCalls = [];
    const summary = await runScheduledSettlementsWithSdk({
      sdk,
      provider,
      address: '0x0000000000000000000000000000000000000002',
      env: { SOME_ENV: 'present' },
      logger: { log() {} },
      async runDisputeEscalationForTaskFn({ onchainTask }) {
        escalationCalls.push(onchainTask.id.toString());
        return {
          status: 'escalated',
          evidenceUri: 'ipfs://example-evidence',
        };
      },
    });

    assert.deepEqual(escalationCalls, ['21']);
    assert.equal(summary.checked, 1);
    assert.equal(summary.eligible, 1);
    assert.equal(summary.settleEligible, 0);
    assert.equal(summary.escalateEligible, 1);
    assert.equal(summary.settled, 0);
    assert.equal(summary.escalated, 1);
    assert.equal(summary.failed, 0);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.failedTasks.length, 0);
  });

  it('tracks retryable escalation errors without stopping the batch', async () => {
    const tasks = [
      makeTask({
        id: 31n,
        status: TaskStatus.DisputedAwaitingAgent,
        resultHash: '0x' + '2'.repeat(64),
      }),
      makeTask({
        id: 32n,
        status: TaskStatus.ResultAsserted,
        cooldownEndsAt: 900n,
      }),
    ];

    const settledIds = [];
    const sdk = {
      async getTasksNeedingAction() {
        return tasks;
      },
      async settleNoContest(taskId) {
        settledIds.push(taskId.toString());
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
      env: { SOME_ENV: 'present' },
      logger: { log() {} },
      async runDisputeEscalationForTaskFn() {
        return {
          status: 'retryable_error',
          code: 'hash_mismatch',
          reason: 'Assertion payload hash mismatch',
        };
      },
    });

    assert.deepEqual(settledIds, ['32']);
    assert.equal(summary.checked, 2);
    assert.equal(summary.eligible, 2);
    assert.equal(summary.settleEligible, 1);
    assert.equal(summary.escalateEligible, 1);
    assert.equal(summary.settled, 1);
    assert.equal(summary.escalated, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.failedTasks.length, 1);
    assert.equal(summary.failedTasks[0].taskId, '31');
    assert.equal(summary.failedTasks[0].action, 'escalateToUMA');
    assert.equal(summary.failedTasks[0].code, 'hash_mismatch');
  });
});

describe('exampleagents multi-chain settlement aggregation', () => {
  it('aggregates per-chain summaries and isolates per-chain failures', async () => {
    const summary = await runScheduledSettlements(
      {},
      {
        chainIds: [9746, 114],
        async getErc8001SdkFn(_env, chainId) {
          if (chainId === 114) {
            throw new Error('flare signer unavailable');
          }
          return {
            sdk: { name: 'sdk-9746' },
            address: '0x0000000000000000000000000000000000000002',
            provider: { name: 'provider-9746' },
          };
        },
        async runScheduledSettlementsWithSdkFn({ chainId }) {
          assert.equal(chainId, 9746);
          return {
            checked: 3,
            eligible: 2,
            settleEligible: 2,
            escalateEligible: 0,
            settled: 2,
            escalated: 0,
            failed: 0,
            skipped: 1,
            failedTasks: [],
          };
        },
      }
    );

    assert.equal(summary.checked, 3);
    assert.equal(summary.eligible, 2);
    assert.equal(summary.settleEligible, 2);
    assert.equal(summary.escalateEligible, 0);
    assert.equal(summary.settled, 2);
    assert.equal(summary.escalated, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.failedTasks.length, 1);
    assert.equal(summary.failedTasks[0].chainId, 114);
    assert.equal(summary.byChain['9746'].checked, 3);
    assert.equal(summary.byChain['114'].error, 'flare signer unavailable');
  });
});

describe('exampleagents module exports', () => {
  it('still exports default worker with scheduled handler', () => {
    assert.equal(typeof workerModule.fetch, 'function');
    assert.equal(typeof workerModule.scheduled, 'function');
  });
});

describe('exampleagents dispute escalation helper', () => {
  it('uploads raw asserted payload and escalates when hash matches', async () => {
    const payloadText = JSON.stringify({ ok: true, answer: 42 });
    const assertionPayloadB64 = Buffer.from(payloadText, 'utf8').toString('base64');
    const expectedHash = calculateResultHash(payloadText);

    const localTask = {
      id: 'run-1',
      response_meta_json: JSON.stringify({
        erc8001: {
          assertionPayloadB64,
          assertionPayloadHash: expectedHash,
        },
      }),
    };

    const metaUpdates = [];
    const escalateCalls = [];
    const result = await runDisputeEscalationForTask({
      env: { IPFS_PROVIDER: 'mock' },
      sdk: {
        async escalateToUMA(taskId, evidenceUri) {
          escalateCalls.push({ taskId: taskId.toString(), evidenceUri });
        },
      },
      onchainTask: {
        id: 401n,
        resultHash: expectedHash,
      },
      async findLocalTaskFn(_env, onchainTaskId) {
        assert.equal(onchainTaskId, '401');
        return localTask;
      },
      async updateEscalationMetadataFn(_env, task, patch) {
        assert.equal(task.id, 'run-1');
        metaUpdates.push(patch);
      },
      async uploadEvidenceFn(content, config) {
        assert.equal(config.provider, 'mock');
        assert.equal(Buffer.from(content).toString('utf8'), payloadText);
        return 'ipfs://mock-evidence';
      },
    });

    assert.equal(result.status, 'escalated');
    assert.equal(result.evidenceUri, 'ipfs://mock-evidence');
    assert.deepEqual(escalateCalls, [{ taskId: '401', evidenceUri: 'ipfs://mock-evidence' }]);
    assert.equal(metaUpdates.length, 1);
    assert.equal(metaUpdates[0].escalation.lastErrorCode, null);
    assert.equal(metaUpdates[0].escalation.evidenceUri, 'ipfs://mock-evidence');
  });

  it('returns retryable hash_mismatch when payload hash differs from chain', async () => {
    const payloadText = JSON.stringify({ ok: true });
    const assertionPayloadB64 = Buffer.from(payloadText, 'utf8').toString('base64');
    const expectedHash = calculateResultHash(payloadText);
    const wrongHash = '0x' + 'f'.repeat(64);

    let escalated = false;
    const metaUpdates = [];
    const result = await runDisputeEscalationForTask({
      env: { IPFS_PROVIDER: 'mock' },
      sdk: {
        async escalateToUMA() {
          escalated = true;
        },
      },
      onchainTask: {
        id: 402n,
        resultHash: wrongHash,
      },
      async findLocalTaskFn() {
        return {
          id: 'run-2',
          response_meta_json: JSON.stringify({
            erc8001: {
              assertionPayloadB64,
              assertionPayloadHash: expectedHash,
            },
          }),
        };
      },
      async updateEscalationMetadataFn(_env, _task, patch) {
        metaUpdates.push(patch);
      },
      async uploadEvidenceFn() {
        throw new Error('upload should not run on hash mismatch');
      },
    });

    assert.equal(escalated, false);
    assert.equal(result.status, 'retryable_error');
    assert.equal(result.code, 'hash_mismatch');
    assert.equal(metaUpdates.length, 1);
    assert.equal(metaUpdates[0].escalation.lastErrorCode, 'hash_mismatch');
  });
});
