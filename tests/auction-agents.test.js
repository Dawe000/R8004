/**
 * Example agents auction unit tests – join and bid endpoints
 * Run: node --test tests/auction-agents.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

const BASE = 'http://agents.test';

async function loadAgents() {
  const mod = await import('../exampleagents/example-agents-worker.js');
  return mod.default;
}

function req(method, path, body = null) {
  const url = BASE + path;
  const opts = { method, headers: {} };
  if (body != null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return new Request(url, opts);
}

async function json(res) {
  assert.strictEqual(res.headers.get('Content-Type'), 'application/json');
  return res.json();
}

describe('agents – POST /:id/a2a/auction/join', () => {
  it('returns 200 with agentId, ask, minAmount, stakeAmount for agent 1', async () => {
    const worker = await loadAgents();
    const res = await worker.fetch(
      req('POST', '/1/a2a/auction/join', {
        auctionId: 'auc-1',
        taskSpec: {},
        paymentToken: '0x',
        taskDeadline: 1e12,
      }),
      {}
    );
    assert.strictEqual(res.status, 200);
    const data = await json(res);
    assert.strictEqual(data.agentId, '1');
    assert.ok(data.ask);
    assert.ok(data.minAmount);
    assert.strictEqual(data.stakeAmount, '50');
    assert.strictEqual(data.ask, '160');
    assert.strictEqual(data.minAmount, '110');
  });

  it('returns 400 without auctionId', async () => {
    const worker = await loadAgents();
    const res = await worker.fetch(
      req('POST', '/1/a2a/auction/join', {
        taskSpec: {},
        paymentToken: '0x',
        taskDeadline: 1e12,
      }),
      {}
    );
    assert.strictEqual(res.status, 400);
  });
});

describe('agents – POST /:id/a2a/auction/:auctionId/bid', () => {
  it('returns undercut ask when marketState has competing prices', async () => {
    const worker = await loadAgents();
    const res = await worker.fetch(
      req('POST', '/2/a2a/auction/some-id/bid', {
        marketState: { competingPrices: [{ price: '200' }] },
      }),
      {}
    );
    assert.strictEqual(res.status, 200);
    const data = await json(res);
    assert.strictEqual(data.agentId, '2');
    assert.strictEqual(data.minAmount, '120');
    assert.ok(BigInt(data.ask) < 200n);
    assert.strictEqual(data.ask, '199');
  });

  it('returns default ask when no marketState', async () => {
    const worker = await loadAgents();
    const res = await worker.fetch(
      req('POST', '/2/a2a/auction/some-id/bid', {}),
      {}
    );
    assert.strictEqual(res.status, 200);
    const data = await json(res);
    assert.strictEqual(data.agentId, '2');
    assert.strictEqual(data.ask, '170');
    assert.strictEqual(data.minAmount, '120');
  });
});
