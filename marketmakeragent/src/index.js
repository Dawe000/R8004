/**
 * Market Maker Agent – ERC8001 auction market
 * Accepts task intents, runs off-chain auction (agents bid with trust-weighted undercutting),
 * returns ranked offers to client; client accepts one → agreed terms for createTask/acceptTask.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...CORS_HEADERS, ...headers, 'Content-Type': 'application/json' },
  });
}

// In-memory store (per isolate). Production would use D1 or KV.
const auctions = new Map();
const bidsByAuction = new Map();
const acceptancesByAuction = new Map();

function getOrCreateBids(auctionId) {
  if (!bidsByAuction.has(auctionId)) bidsByAuction.set(auctionId, new Map());
  return bidsByAuction.get(auctionId);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
    const segments = pathname ? pathname.split('/') : [];

    if (segments[0] !== 'auction') {
      return jsonResponse(
        {
          message: 'Market Maker Agent – auction market',
          endpoints: [
            'POST /auction (TaskIntent → create auction, notify agents)',
            'GET /auction/:auctionId',
            'POST /auction/:auctionId/bid',
            'GET /auction/:auctionId/offers',
            'POST /auction/:auctionId/accept',
          'POST /auction/:auctionId/round (run one undercut round)',
          ],
        },
        200
      );
    }

    const auctionId = segments[1];
    const sub = segments[2];

    // POST /auction – create auction (TaskIntent)
    if (request.method === 'POST' && segments.length === 1) {
      return handleCreateAuction(request, env);
    }

    if (!auctionId) {
      return jsonResponse({ error: 'Missing auctionId' }, 400);
    }

    // GET /auction/:auctionId – get auction (for agents polling)
    if (request.method === 'GET' && segments.length === 2) {
      return handleGetAuction(auctionId);
    }

    // POST /auction/:auctionId/bid – join or update bid
    if (request.method === 'POST' && segments.length === 3 && sub === 'bid') {
      return handleBid(request, auctionId, env);
    }

    // GET /auction/:auctionId/offers – ranked offers for client
    if (request.method === 'GET' && segments.length === 3 && sub === 'offers') {
      return handleGetOffers(auctionId, env);
    }

    // POST /auction/:auctionId/accept – client accepts an offer
    if (request.method === 'POST' && segments.length === 3 && sub === 'accept') {
      return handleAccept(request, auctionId);
    }

    // POST /auction/:auctionId/round – run one round: send market state to agents, collect updated bids
    if (request.method === 'POST' && segments.length === 3 && sub === 'round') {
      return handleRound(auctionId, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

async function handleCreateAuction(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const auctionId = body.auctionId || crypto.randomUUID();
  const taskSpec = body.taskSpec || body.descriptionURI;
  const paymentToken = body.paymentToken;
  const taskDeadline = body.taskDeadline;
  const expiresAt = body.expiresAt || 0;

  if (!paymentToken || taskDeadline == null) {
    return jsonResponse(
      { error: 'Missing required fields: paymentToken, taskDeadline' },
      400
    );
  }

  if (auctions.has(auctionId)) {
    return jsonResponse({ error: 'Auction already exists', auctionId }, 409);
  }

  const auction = {
    auctionId,
    taskSpec,
    paymentToken,
    taskDeadline,
    expiresAt,
    createdAt: Date.now(),
  };
  auctions.set(auctionId, auction);
  getOrCreateBids(auctionId);

  // Notify agents: POST to each agent's a2a/auction/join; store returned bid
  const agentBaseUrls = (env.AGENT_BASE_URLS || '').split(',').filter(Boolean);
  const bids = getOrCreateBids(auctionId);
  for (const baseUrl of agentBaseUrls) {
    const joinUrl = baseUrl.replace(/\/$/, '') + '/a2a/auction/join';
    try {
      const res = await fetch(joinUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId,
          taskSpec,
          paymentToken,
          taskDeadline,
          expiresAt,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agentId != null && data.ask != null && data.minAmount != null) {
          bids.set(data.agentId, {
            ask: String(data.ask),
            minAmount: String(data.minAmount),
            stakeAmount: data.stakeAmount != null ? String(data.stakeAmount) : undefined,
            taskDeadline: data.taskDeadline,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (e) {
      // Log but don't fail auction creation
    }
  }

  return jsonResponse({
    auctionId,
    message: 'Auction created. Agents can submit bids to POST /auction/:auctionId/bid. Client can GET /auction/:auctionId/offers then POST /auction/:auctionId/accept.',
  });
}

function handleGetAuction(auctionId) {
  const auction = auctions.get(auctionId);
  if (!auction) {
    return jsonResponse({ error: 'Auction not found', auctionId }, 404);
  }
  return jsonResponse(auction);
}

async function handleBid(request, auctionId, env) {
  const auction = auctions.get(auctionId);
  if (!auction) {
    return jsonResponse({ error: 'Auction not found', auctionId }, 404);
  }
  if (auction.expiresAt && Date.now() > auction.expiresAt) {
    return jsonResponse({ error: 'Auction expired' }, 410);
  }
  if (acceptancesByAuction.get(auctionId)) {
    return jsonResponse({ error: 'Auction already accepted' }, 409);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const agentId = body.agentId;
  let ask = body.ask;
  const minAmount = body.minAmount;
  const stakeAmount = body.stakeAmount;
  const taskDeadline = body.taskDeadline;

  if (!agentId || ask == null || minAmount == null) {
    return jsonResponse(
      { error: 'Missing required fields: agentId, ask, minAmount' },
      400
    );
  }

  ask = String(ask);
  const minStr = String(minAmount);
  if (BigInt(ask) < BigInt(minStr)) {
    return jsonResponse({ error: 'ask must be >= minAmount' }, 400);
  }

  const bids = getOrCreateBids(auctionId);
  bids.set(agentId, {
    ask,
    minAmount: minStr,
    stakeAmount: stakeAmount != null ? String(stakeAmount) : undefined,
    taskDeadline,
    updatedAt: Date.now(),
  });

  return jsonResponse({
    auctionId,
    agentId,
    ask,
    minAmount: minStr,
    message: 'Bid recorded',
  });
}

async function handleGetOffers(auctionId, env) {
  const auction = auctions.get(auctionId);
  if (!auction) {
    return jsonResponse({ error: 'Auction not found', auctionId }, 404);
  }

  const bids = bidsByAuction.get(auctionId);
  if (!bids || bids.size === 0) {
    return jsonResponse({ offers: [], message: 'No bids yet' });
  }

  const trustApiUrl = (env.TRUST_API_URL || '').replace(/\/$/, '');
  const offers = [];

  for (const [agentId, b] of bids.entries()) {
    let trustScore = 50;
    if (trustApiUrl) {
      try {
        const res = await fetch(`${trustApiUrl}/trust/${agentId}`);
        if (res.ok) {
          const data = await res.json();
          trustScore = data.score != null ? data.score : 50;
        }
      } catch (_) {}
    }
    offers.push({
      agentId,
      trustScore,
      currentPrice: b.ask,
      minPrice: b.minAmount,
      stakeAmount: b.stakeAmount,
      taskDeadline: b.taskDeadline,
    });
  }

  // Sort by price ascending, then by trust descending
  offers.sort((a, b) => {
    const priceA = BigInt(a.currentPrice);
    const priceB = BigInt(b.currentPrice);
    if (priceA !== priceB) return priceA < priceB ? -1 : 1;
    return (b.trustScore || 0) - (a.trustScore || 0);
  });

  return jsonResponse({ offers });
}

async function handleAccept(request, auctionId) {
  const auction = auctions.get(auctionId);
  if (!auction) {
    return jsonResponse({ error: 'Auction not found', auctionId }, 404);
  }
  if (acceptancesByAuction.get(auctionId)) {
    return jsonResponse({ error: 'Offer already accepted for this auction' }, 409);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const agentId = body.agentId;
  const acceptedPrice = body.acceptedPrice;

  if (!agentId || acceptedPrice == null) {
    return jsonResponse(
      { error: 'Missing required fields: agentId, acceptedPrice' },
      400
    );
  }

  const bids = bidsByAuction.get(auctionId);
  const bid = bids?.get(agentId);
  if (!bid) {
    return jsonResponse({ error: 'No bid from this agent', agentId }, 404);
  }
  if (String(acceptedPrice) !== bid.ask) {
    return jsonResponse(
      {
        error: 'acceptedPrice must match agent current bid',
        expected: bid.ask,
      },
      400
    );
  }

  acceptancesByAuction.set(auctionId, { agentId, acceptedPrice: bid.ask });

  const agreedTerms = {
    taskSpec: auction.taskSpec,
    paymentToken: auction.paymentToken,
    paymentAmount: bid.ask,
    deadline: bid.taskDeadline || auction.taskDeadline,
    stakeAmount: bid.stakeAmount,
    agentId,
  };

  return jsonResponse({
    message: 'Offer accepted. Use agreed terms to createTask and acceptTask on-chain.',
    agreedTerms,
  });
}

async function handleRound(auctionId, env) {
  const auction = auctions.get(auctionId);
  if (!auction) {
    return jsonResponse({ error: 'Auction not found', auctionId }, 404);
  }
  if (auction.expiresAt && Date.now() > auction.expiresAt) {
    return jsonResponse({ error: 'Auction expired' }, 410);
  }
  if (acceptancesByAuction.get(auctionId)) {
    return jsonResponse({ error: 'Auction already accepted' }, 409);
  }

  const bids = bidsByAuction.get(auctionId);
  if (!bids || bids.size === 0) {
    return jsonResponse({ message: 'No bids to run round' });
  }

  const trustApiUrl = (env.TRUST_API_URL || '').replace(/\/$/, '');
  const competingPrices = [];
  for (const [agentId, b] of bids.entries()) {
    let trustScore = 50;
    if (trustApiUrl) {
      try {
        const res = await fetch(`${trustApiUrl}/trust/${agentId}`);
        if (res.ok) {
          const data = await res.json();
          trustScore = data.score != null ? data.score : 50;
        }
      } catch (_) {}
    }
    competingPrices.push({ price: b.ask, trustScore });
  }

  const agentBaseUrls = (env.AGENT_BASE_URLS || '').split(',').filter(Boolean);
  for (const baseUrl of agentBaseUrls) {
    const bidUrl = baseUrl.replace(/\/$/, '') + `/a2a/auction/${auctionId}/bid`;
    try {
      const res = await fetch(bidUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketState: { competingPrices },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agentId != null && data.ask != null && data.minAmount != null) {
          const bidMap = getOrCreateBids(auctionId);
          bidMap.set(data.agentId, {
            ask: String(data.ask),
            minAmount: String(data.minAmount),
            stakeAmount: data.stakeAmount != null ? String(data.stakeAmount) : undefined,
            taskDeadline: data.taskDeadline,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (_) {}
  }

  return jsonResponse({
    auctionId,
    message: 'Round complete. GET /auction/:auctionId/offers for updated offers.',
  });
}
