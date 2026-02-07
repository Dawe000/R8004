# Market Maker Agent

Runs the **agent-run auction market** for ERC8001 task intents: clients submit a task (no price), appropriate agents bid and may undercut each other (trust-weighted); client sees ranked offers and selects one, then proceeds to **createTask** / **acceptTask** on-chain.

- **Task intent:** Client POSTs task spec, payment token, deadline (no price).
- **Agent discovery:** Uses configurable agent list and Trust API (e.g. TrustApiMock) for trust scores.
- **Auction:** Notifies agents (POST to each agent’s `a2a/auction/join`), stores bids; optional **rounds** (POST `auction/:id/round`) to run trust-weighted undercutting.
- **Offers:** GET ranked list (agentId, trustScore, currentPrice, minPrice, …).
- **Accept:** Client POSTs chosen agentId + price; returns agreed terms for on-chain createTask/acceptTask.

## Setup

1. **Wrangler** (see [Cloudflare Workers](https://developers.cloudflare.com/workers/wrangler/install-and-update/)).

2. **Environment (e.g. in `wrangler.toml` or `.dev.vars`):**
   - `TRUST_API_URL` – base URL of the trust API (e.g. `http://localhost:8787` for TrustApiMock).
   - `AGENT_BASE_URLS` – comma-separated list of agent base URLs the MM will call for join/bid (e.g. `http://localhost:8788/1,http://localhost:8788/2`).

3. **Run:**
   - Local: `npx wrangler dev` (default port 8789 or next available).
   - Deploy: `npx wrangler deploy`.

## Endpoints

| Method | Path | Description |
|--------|------|--------------|
| GET | `/` | Service info and endpoint list |
| POST | `/auction` | Create auction (TaskIntent body) |
| GET | `/auction/:auctionId` | Get auction (for agents polling) |
| POST | `/auction/:auctionId/bid` | Submit or update bid (agent) |
| GET | `/auction/:auctionId/offers` | Ranked offers (client) |
| POST | `/auction/:auctionId/accept` | Accept an offer (client) |
| POST | `/auction/:auctionId/round` | Run one undercut round |

See [TECHNICAL_SPEC.md](../docs/TECHNICAL_SPEC.md) §2.5 for message shapes (TaskIntent, Join/Bid, Offers, Accept).
## Overview

Cloudflare Worker that matches client task queries to suitable agents using Venice AI query embeddings and Pinecone vector search.

## Features

- **Venice API Integration**: Generates semantic embeddings for task queries
- **Pinecone Vector Search**: Uses stored agent-card vectors for semantic retrieval
- **Trust Scoring**: Evaluates agents based on stake requirements and SLA metrics
- **Ranked Results**: Returns top 5 agents with match scores and reasoning
- **Dynamic Agent Discovery**: Fetches available agent IDs/cards from the agents worker
- **Matching-only scope**: Does not proxy ERC8001 execution dispatch/payment alerts

## API Endpoints

### `GET /health`
Health check endpoint
```json
{ "status": "ok", "service": "market-maker-agent", "env": "development" }
```

### `POST /api/match-agents`
Match agents to task query

**Request:**
```json
{
  "query": "Find yield farming opportunities on Base chain",
  "paymentAmount": "1000000000000000000",
  "paymentToken": "0x...",
  "minReputationScore": 70
}
```

**Response:**
```json
{
  "query": "Find yield farming opportunities on Base chain",
  "matchStrategy": "semantic-pinecone-cosine-similarity",
  "agents": [
    {
      "agent": { /* AgentCapabilityCard */ },
      "score": 0.89,
      "trustScore": 0.85,
      "reason": "Excellent capability match with strong trust rating"
    }
  ]
}
```

### `POST /api/agents/:agentId/erc8001/dispatch`
Dispatch an ERC8001-linked task to a selected agent route (testing flow).

**Request:**
```json
{
  "onchainTaskId": "123",
  "input": "summarize this prompt",
  "stakeAmountWei": "1000000000000000",
  "skill": "optional-skill-id"
}
```

**Response:**
```json
{
  "agentId": "1",
  "runId": "uuid",
  "status": "accepted",
  "onchainTaskId": "123",
  "statusUrl": "/1/tasks/uuid"
}
```

## Development

```bash
# Install dependencies
npm install

# Run locally with wrangler
npm run dev

# Type check
npm run typecheck

# Run local test suite (mocks Venice/Pinecone/agent worker APIs)
npm test

# Run live smoke tests against Venice + Pinecone (real network calls)
npm run test:live

# Deploy to Cloudflare
npm run deploy
```

## Environment Variables

Set via `wrangler secret put`:
```bash
wrangler secret put VENICE_API_KEY
wrangler secret put PINECONE_API_KEY
```

Set non-secret host via `wrangler.toml` or `.dev.vars`:
```
PINECONE_INDEX_HOST=https://your-index-host.pinecone.io
```

## Live Tests

`npm run test:live` runs service-level smoke tests that hit live Venice embeddings and live Pinecone query APIs.

Required env vars (from process env or repo-root `.env`):
```
VENICE_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_HOST=...
```

Optional env var:
```
LIVE_TEST_QUERY=your custom query text
```

Prerequisite:
```
# From repo root, ensure Pinecone already has vectors
npm run sync:agent-vectors
```

If Pinecone returns no matches, the live test fails with a setup hint to run the sync command.

Cost note: live tests call paid external APIs (Venice + Pinecone), so keep them opt-in.

## Architecture

- **VeniceService**: Generates embeddings via Venice AI API
- **PineconeService**: Queries Pinecone for nearest agent vectors
- **AgentRegistry**: Holds fetched agent capability cards for response shaping
- **AgentMatcher**: Pinecone semantic score + trust scoring algorithm
- **index.ts**: Cloudflare Worker request handler

## Scoring Algorithm

- **Semantic Score (70%)**: Pinecone similarity score from query vector match
- **Trust Score (30%)**: Based on stake amount + completion time
- Final agents ranked by combined score
