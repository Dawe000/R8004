import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type AgentsApiModule = typeof import('../src/lib/api/agents');

const previousEnv = process.env.NEXT_PUBLIC_AGENTS_BASE_URL;
const originalFetch = globalThis.fetch;

async function importAgentsApiFresh(baseUrl = 'https://agents.test'): Promise<AgentsApiModule> {
  process.env.NEXT_PUBLIC_AGENTS_BASE_URL = baseUrl;
  const fileUrl = pathToFileURL(path.resolve('frontend/src/lib/api/agents.ts')).href;
  return import(`${fileUrl}?t=${Date.now()}-${Math.random()}`);
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousEnv == null) {
    delete process.env.NEXT_PUBLIC_AGENTS_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_AGENTS_BASE_URL = previousEnv;
  }
});

describe('frontend direct agent API helpers', () => {
  it('getAgentCard fetches selected agent card', async () => {
    const mod = await importAgentsApiFresh('https://agents.local');
    globalThis.fetch = (async (url: string) => {
      assert.equal(url, 'https://agents.local/5/card');
      return new Response(JSON.stringify({ id: '5', name: 'Agent 5' }), { status: 200 });
    }) as typeof fetch;

    const card = (await mod.getAgentCard('5')) as { id: string; name: string };
    assert.equal(card.id, '5');
    assert.equal(card.name, 'Agent 5');
  });

  it('createTaskSpecUri posts to /api/ipfs/task and returns uri', async () => {
    const mod = await importAgentsApiFresh();
    const calls: Array<{ url: string; body: unknown }> = [];

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ uri: 'ipfs://mock123' }), { status: 200 });
    }) as typeof fetch;

    const uri = await mod.createTaskSpecUri({
      version: 'erc8001-task/v1',
      input: 'hello world',
    });

    assert.equal(uri, 'ipfs://mock123');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/ipfs/task');
    assert.equal((calls[0].body as { input: string }).input, 'hello world');
  });

  it('dispatchErc8001TaskDirect omits raw input and returns normalized accepted response', async () => {
    const mod = await importAgentsApiFresh('https://agents.local');
    let capturedBody: unknown = null;
    let capturedUrl = '';

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(JSON.stringify({ id: 'run-1', statusUrl: '/1/tasks/run-1' }), {
        status: 202,
      });
    }) as typeof fetch;

    const response = await mod.dispatchErc8001TaskDirect({
      agentId: '1',
      onchainTaskId: '12',
      stakeAmountWei: '1000',
      skill: 'research',
    });

    assert.equal(capturedUrl, 'https://agents.local/1/tasks?forceAsync=true');
    const payload = capturedBody as {
      task: { skill?: string; input?: string };
      erc8001: { taskId: string; stakeAmountWei: string; publicBaseUrl: string };
    };
    assert.equal(payload.task.skill, 'research');
    assert.equal(payload.task.input, undefined);
    assert.equal(payload.erc8001.taskId, '12');
    assert.equal(response.runId, 'run-1');
    assert.equal(response.status, 'accepted');
  });

  it('notifyErc8001PaymentDepositedDirect returns parsed body on success', async () => {
    const mod = await importAgentsApiFresh();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: 'queued' }), {
        status: 202,
      })) as typeof fetch;

    const result = (await mod.notifyErc8001PaymentDepositedDirect({
      agentId: '1',
      onchainTaskId: '500',
    })) as { status: string };

    assert.equal(result.status, 'queued');
  });

  it('notifyErc8001PaymentDepositedDirect surfaces HTTP 409 details', async () => {
    const mod = await importAgentsApiFresh();
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: 'payment_not_deposited',
          details: 'On-chain paymentDeposited is false for this task.',
        }),
        { status: 409 }
      )) as typeof fetch;

    await assert.rejects(
      () =>
        mod.notifyErc8001PaymentDepositedDirect({
          agentId: '2',
          onchainTaskId: '999',
        }),
      /Payment notification failed \(409\): On-chain paymentDeposited is false/
    );
  });
});
