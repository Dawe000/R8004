/**
 * SDK unit tests – createAuctionClient with mocked fetch
 * Run: node --test tests/auction-sdk.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAuctionClient } from '../intentssystemsdk/src/index.js';

const BASE = 'http://sdk.test';

const originalFetch = globalThis.fetch;

describe('SDK createAuction', () => {
  it('calls fetch POST baseUrl/auction and returns auctionId', async () => {
    let capturedUrl;
    let capturedOpts;
    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return new Response(JSON.stringify({ auctionId: 'x' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    try {
      const client = createAuctionClient(BASE);
      const result = await client.createAuction({
        paymentToken: '0x',
        taskDeadline: 1e12,
      });
      assert.strictEqual(result.auctionId, 'x');
      assert.strictEqual(capturedUrl, BASE + '/auction');
      assert.strictEqual(capturedOpts.method, 'POST');
      assert.ok(JSON.parse(capturedOpts.body).taskDeadline);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SDK getOffers', () => {
  it('calls fetch GET baseUrl/auction/:id/offers and returns offers', async () => {
    const offers = [{ agentId: '1', currentPrice: '100' }];
    globalThis.fetch = async (url) => {
      if (url === BASE + '/auction/auc-1/offers') {
        return new Response(JSON.stringify({ offers }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    };
    try {
      const client = createAuctionClient(BASE);
      const result = await client.getOffers('auc-1');
      assert.deepStrictEqual(result.offers, offers);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SDK acceptOffer', () => {
  it('calls fetch POST baseUrl/auction/:id/accept and returns agreedTerms', async () => {
    const agreedTerms = { paymentAmount: '100', agentId: '1' };
    globalThis.fetch = async (url, opts) => {
      if (url === BASE + '/auction/auc-1/accept') {
        return new Response(JSON.stringify({ agreedTerms }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    };
    try {
      const client = createAuctionClient(BASE);
      const result = await client.acceptOffer('auc-1', {
        agentId: '1',
        acceptedPrice: '100',
      });
      assert.strictEqual(result.agreedTerms.paymentAmount, '100');
      assert.strictEqual(result.agreedTerms.agentId, '1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SDK runRound', () => {
  it('calls fetch POST baseUrl/auction/:id/round', async () => {
    let called = false;
    globalThis.fetch = async (url) => {
      if (url === BASE + '/auction/auc-1/round') {
        called = true;
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 404 });
    };
    try {
      const client = createAuctionClient(BASE);
      await client.runRound('auc-1');
      assert.strictEqual(called, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SDK getAuction', () => {
  it('calls fetch GET baseUrl/auction/:id and returns auction', async () => {
    const auction = { auctionId: 'auc-1', paymentToken: '0x' };
    globalThis.fetch = async (url) => {
      if (url === BASE + '/auction/auc-1') {
        return new Response(JSON.stringify(auction), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    };
    try {
      const client = createAuctionClient(BASE);
      const result = await client.getAuction('auc-1');
      assert.strictEqual(result.auctionId, 'auc-1');
      assert.strictEqual(result.paymentToken, '0x');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SDK error handling', () => {
  it('throws when fetch returns non-ok with API error message', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Auction not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    try {
      const client = createAuctionClient(BASE);
      await assert.rejects(
        async () => await client.getOffers('bad'),
        (err) => {
          assert.ok(err.message.includes('Auction not found') || err.message.includes('404'));
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
