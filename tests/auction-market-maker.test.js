/**
 * Market maker unit tests – auction create, bid, offers, accept
 * Run: node --test tests/auction-market-maker.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

const BASE = 'http://mm.test';

async function loadMM() {
  const mod = await import('../marketmakeragent/src/index.js');
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

describe('market maker – POST /auction', () => {
  it('returns 200 and auctionId with valid body', async () => {
    const worker = await loadMM();
    const res = await worker.fetch(
      req('POST', '/auction', {
        paymentToken: '0xToken',
        taskDeadline: 1e12,
        taskSpec: { title: 'Test' },
      }),
      { AGENT_BASE_URLS: '' }
    );
    assert.strictEqual(res.status, 200);
    const data = await json(res);
    assert.ok(data.auctionId);
    assert.strictEqual(typeof data.auctionId, 'string');
  });

  it('returns 400 without paymentToken', async () => {
    const worker = await loadMM();
    const res = await worker.fetch(
      req('POST', '/auction', { taskDeadline: 1e12 }),
      {}
    );
    assert.strictEqual(res.status, 400);
    const data = await json(res);
    assert.ok(data.error);
  });

  it('returns 400 without taskDeadline', async () => {
    const worker = await loadMM();
    const res = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0x' }),
      {}
    );
    assert.strictEqual(res.status, 400);
  });
});

describe('market maker – GET /auction/:id', () => {
  it('returns 200 and auction after create', async () => {
    const worker = await loadMM();
    const createRes = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
      {}
    );
    const { auctionId } = await json(createRes);
    const getRes = await worker.fetch(req('GET', '/auction/' + auctionId), {});
    assert.strictEqual(getRes.status, 200);
    const auction = await json(getRes);
    assert.strictEqual(auction.auctionId, auctionId);
    assert.strictEqual(auction.paymentToken, '0xT');
  });

  it('returns 404 for unknown id', async () => {
    const worker = await loadMM();
    const res = await worker.fetch(req('GET', '/auction/unknown-id'), {});
    assert.strictEqual(res.status, 404);
  });
});

describe('market maker – POST /auction/:id/bid', () => {
  it('records bid and returns 200', async () => {
    const worker = await loadMM();
    const createRes = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
      {}
    );
    const { auctionId } = await json(createRes);
    const bidRes = await worker.fetch(
      req('POST', '/auction/' + auctionId + '/bid', {
        agentId: '1',
        ask: '200',
        minAmount: '100',
      }),
      {}
    );
    assert.strictEqual(bidRes.status, 200);
    const data = await json(bidRes);
    assert.strictEqual(data.agentId, '1');
    assert.strictEqual(data.ask, '200');
  });

  it('returns 400 when ask < minAmount', async () => {
    const worker = await loadMM();
    const createRes = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
      {}
    );
    const { auctionId } = await json(createRes);
    const bidRes = await worker.fetch(
      req('POST', '/auction/' + auctionId + '/bid', {
        agentId: '1',
        ask: '50',
        minAmount: '100',
      }),
      {}
    );
    assert.strictEqual(bidRes.status, 400);
  });
});

describe('market maker – GET /auction/:id/offers', () => {
  it('returns empty offers when no bids', async () => {
    const worker = await loadMM();
    const createRes = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
      {}
    );
    const { auctionId } = await json(createRes);
    const res = await worker.fetch(
      req('GET', '/auction/' + auctionId + '/offers'),
      {}
    );
    assert.strictEqual(res.status, 200);
    const data = await json(res);
    assert.strictEqual(Array.isArray(data.offers), true);
    assert.strictEqual(data.offers.length, 0);
  });

  it('returns offers sorted by price with trustScore when fetch mock returns trust', async () => {
    const worker = await loadMM();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes('/trust/')) {
        return new Response(JSON.stringify({ score: 75 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url);
    };
    try {
      const createRes = await worker.fetch(
        req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
        {}
      );
      const { auctionId } = await json(createRes);
      await worker.fetch(
        req('POST', '/auction/' + auctionId + '/bid', {
          agentId: '1',
          ask: '200',
          minAmount: '100',
        }),
        {}
      );
      await worker.fetch(
        req('POST', '/auction/' + auctionId + '/bid', {
          agentId: '2',
          ask: '150',
          minAmount: '100',
        }),
        {}
      );
      const offersRes = await worker.fetch(
        req('GET', '/auction/' + auctionId + '/offers'),
        { TRUST_API_URL: 'http://trust.test' }
      );
      assert.strictEqual(offersRes.status, 200);
      const data = await json(offersRes);
      assert.strictEqual(data.offers.length, 2);
      assert.strictEqual(data.offers[0].currentPrice, '150');
      assert.strictEqual(data.offers[1].currentPrice, '200');
      data.offers.forEach((o) => {
        assert.ok(o.agentId);
        assert.strictEqual(o.trustScore, 75);
        assert.ok(o.currentPrice);
        assert.ok(o.minPrice);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('market maker – POST /auction/:id/accept', () => {
  it('returns 200 and agreedTerms when acceptedPrice matches bid', async () => {
    const worker = await loadMM();
    const createRes = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
      {}
    );
    const { auctionId } = await json(createRes);
    await worker.fetch(
      req('POST', '/auction/' + auctionId + '/bid', {
        agentId: '1',
        ask: '180',
        minAmount: '100',
      }),
      {}
    );
    const acceptRes = await worker.fetch(
      req('POST', '/auction/' + auctionId + '/accept', {
        agentId: '1',
        acceptedPrice: '180',
      }),
      {}
    );
    assert.strictEqual(acceptRes.status, 200);
    const data = await json(acceptRes);
    assert.ok(data.agreedTerms);
    assert.strictEqual(data.agreedTerms.paymentAmount, '180');
    assert.strictEqual(data.agreedTerms.agentId, '1');
    assert.strictEqual(data.agreedTerms.paymentToken, '0xT');
    assert.ok(data.agreedTerms.deadline);
    assert.strictEqual(data.agreedTerms.stakeAmount, undefined);
  });

  it('returns 400 when acceptedPrice does not match bid', async () => {
    const worker = await loadMM();
    const createRes = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
      {}
    );
    const { auctionId } = await json(createRes);
    await worker.fetch(
      req('POST', '/auction/' + auctionId + '/bid', {
        agentId: '1',
        ask: '180',
        minAmount: '100',
      }),
      {}
    );
    const acceptRes = await worker.fetch(
      req('POST', '/auction/' + auctionId + '/accept', {
        agentId: '1',
        acceptedPrice: '100',
      }),
      {}
    );
    assert.strictEqual(acceptRes.status, 400);
    const data = await json(acceptRes);
    assert.ok(data.error?.includes('match') || data.expected);
  });

  it('returns 404 when agentId has no bid', async () => {
    const worker = await loadMM();
    const createRes = await worker.fetch(
      req('POST', '/auction', { paymentToken: '0xT', taskDeadline: 1e12 }),
      {}
    );
    const { auctionId } = await json(createRes);
    const acceptRes = await worker.fetch(
      req('POST', '/auction/' + auctionId + '/accept', {
        agentId: '99',
        acceptedPrice: '100',
      }),
      {}
    );
    assert.strictEqual(acceptRes.status, 404);
  });
});
