# Market Maker Agent

Routes natural-language task intents to agents using ERC8004 semantic search.

## Overview

Cloudflare Worker that matches client task queries to suitable agents using Venice AI embeddings and semantic similarity scoring.

## Features

- **Venice API Integration**: Generates semantic embeddings for task queries and agent capabilities
- **Semantic Matching**: Cosine similarity scoring between queries and agent capability cards
- **Trust Scoring**: Evaluates agents based on stake requirements and SLA metrics
- **Ranked Results**: Returns top 5 agents with match scores and reasoning
- **Mock Registry**: 5 example agents (DeFi, security, NFT, gas, DAO)

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
  "matchStrategy": "semantic-embedding-cosine-similarity",
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

## Development

```bash
# Install dependencies
npm install

# Run locally with wrangler
npm run dev

# Type check
npm run typecheck

# Deploy to Cloudflare
npm run deploy
```

## Environment Variables

Set via `wrangler secret put`:
```bash
wrangler secret put VENICE_API_KEY
```

Or use `.dev.vars` for local development:
```
VENICE_API_KEY=your-api-key-here
```

## Architecture

- **VeniceService**: Generates embeddings via Venice AI API
- **AgentRegistry**: Mock registry of agent capability cards
- **AgentMatcher**: Semantic matching + trust scoring algorithm
- **index.ts**: Cloudflare Worker request handler

## Scoring Algorithm

- **Semantic Score (70%)**: Cosine similarity between query and agent embeddings
- **Trust Score (30%)**: Based on stake amount + completion time
- Final agents ranked by combined score
