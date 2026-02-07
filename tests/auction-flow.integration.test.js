/**
 * Integration test – full price negotiation flow with patched fetch
 * MM and agents run in-process; fetch is patched to route agent/trust calls.
 * Run: node --test tests/auction-flow.integration.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

const MM_BASE = 'http://mm.test';
const AGENT_BASE = 'http://agent.test';
const TRUST_BASE = 'http://trust.test';

async function loadWorkers() {
  const [mmMod, agentsMod] = await Promise.all([
    import('../marketmakeragent/src/index.js'),
    import('../exampleagents/example-agents-worker.js'),
  ]);
  return { mmWorker: mmMod.default, agentsWorker: agentsMod.default };
}

function mmRequest(method, path, body = null) {
  const url = MM_BASE + path;
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

describe('auction flow integration', () => {
  it('create auction -> get offers -> accept returns agreedTerms', async () => {
    const { mmWorker, agentsWorker } = await loadWorkers();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.startsWith(AGENT_BASE + '/')) {
        const req = new Request(url, opts);
        return agentsWorker.fetch(req, {});
      }
      if (urlStr.startsWith(TRUST_BASE + '/')) {
        return new Response(JSON.stringify({ score: 75 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, opts);
    };

    const env = {
      TRUST_API_URL: TRUST_BASE,
      AGENT_BASE_URLS: AGENT_BASE + '/1,' + AGENT_BASE + '/2',
    };

    try {
      const createRes = await mmWorker.fetch(
        mmRequest('POST', '/auction', {
          paymentToken: '0xToken',
          taskDeadline: 1e12,
          taskSpec: {},
        }),
        env
      );
      assert.strictEqual(createRes.status, 200);
      const createData = await json(createRes);
      const auctionId = createData.auctionId;
      assert.ok(auctionId);

      const offersRes = await mmWorker.fetch(
        mmRequest('GET', '/auction/' + auctionId + '/offers'),
        env
      );
      assert.strictEqual(offersRes.status, 200);
      const offersData = await json(offersRes);
      assert.strictEqual(offersData.offers.length, 2);
      assert.ok(offersData.offers.every((o) => o.agentId && o.currentPrice && o.trustScore === 75));
      const byPrice = [...offersData.offers].sort(
        (a, b) => Number(BigInt(a.currentPrice) - BigInt(b.currentPrice))
      );
      assert.strictEqual(byPrice[0].currentPrice <= byPrice[1].currentPrice, true);

      const first = offersData.offers[0];
      const acceptRes = await mmWorker.fetch(
        mmRequest('POST', '/auction/' + auctionId + '/accept', {
          agentId: first.agentId,
          acceptedPrice: first.currentPrice,
        }),
        env
      );
      assert.strictEqual(acceptRes.status, 200);
      const acceptData = await json(acceptRes);
      assert.ok(acceptData.agreedTerms);
      assert.strictEqual(acceptData.agreedTerms.paymentAmount, first.currentPrice);
      assert.strictEqual(acceptData.agreedTerms.agentId, first.agentId);
      assert.strictEqual(acceptData.agreedTerms.paymentToken, '0xToken');
      assert.ok(acceptData.agreedTerms.deadline);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
