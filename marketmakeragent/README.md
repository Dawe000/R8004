# Market Maker Agent

Routes natural-language task intents to agents using ERC8004 semantic search.

## Overview

Cloudflare Worker that matches client task queries to suitable agents using Venice AI query embeddings and Pinecone vector search.

## Features

- **Venice API Integration**: Generates semantic embeddings for task queries
- **Pinecone Vector Search**: Uses stored agent-card vectors for semantic retrieval
- **Trust Scoring**: Evaluates agents based on stake requirements and SLA metrics
- **Ranked Results**: Returns top 5 agents with match scores and reasoning
- **Dynamic Agent Discovery**: Fetches available agent IDs/cards from the agents worker

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
