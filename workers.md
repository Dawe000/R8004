# Deployed Workers

For semantic matching (market maker and example agents), populate Pinecone from repo root with `npm run sync:agent-vectors`; see `exampleagents/README.md` and `marketmakeragent/README.md`.

## Market Maker Agent
**URL**: https://market-maker-agent.lynethlabs.workers.dev

Intelligent agent matching using Venice AI embeddings + Trust API scores.

### Test Commands

```bash
# Test 1: Twitter Sentiment Query
curl -X POST https://market-maker-agent.lynethlabs.workers.dev/api/match-agents \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the sentiment on $TSLA today?"}'

# Test 2: Polymarket Price Query
curl -X POST https://market-maker-agent.lynethlabs.workers.dev/api/match-agents \
  -H "Content-Type: application/json" \
  -d '{"query": "Find current Polymarket odds for ETH"}'
```

---

## Trust API Mock
**URL**: https://trust-api-mock.lynethlabs.workers.dev

D1-backed trust/reputation scores for agents 1-10.

### Test Commands

```bash
# Get all trust scores
curl https://trust-api-mock.lynethlabs.workers.dev/trust

# Get specific agent trust score
curl https://trust-api-mock.lynethlabs.workers.dev/trust/1

# Update agent trust score
curl -X PUT https://trust-api-mock.lynethlabs.workers.dev/trust/1 \
  -H "Content-Type: application/json" \
  -d '{"score": 95, "signals": {"tasksCompleted": 50, "disputes": 0}}'
```

---

## Example Agents Worker
**URL**: https://example-agent.lynethlabs.workers.dev

10 example agents for testing (Twitter Sentiment, Polymarket Price Finder, etc).

### Test Commands

```bash
# List all agents
curl https://example-agent.lynethlabs.workers.dev/

# Get agent card
curl https://example-agent.lynethlabs.workers.dev/1/card
```

---

## DVM Agent (UMA Dispute Resolution)
**URL**: https://dvm-agent.lynethlabs.workers.dev
**Package**: `dvm-agent/`

Cron-triggered worker that resolves UMA disputes for AgentTaskEscrow:
- Runs every 5 minutes via Cloudflare Cron
- Fetches escalated disputes from `TaskDisputeEscalated` events (event-based, efficient)
- Uses Venice AI to decide winner from evidence (task description, client/agent evidence, result)
- Submits resolution via `MockOOv3.pushResolution(assertionId, agentWins)`
- D1 database tracks `last_checked_block` and `processed_assertions` for idempotency

### Setup

1. Create D1 database: `wrangler d1 create dvm-agent-state` then put the returned `database_id` in `wrangler.toml`.
2. Apply migrations: `wrangler d1 migrations apply dvm-agent-state --remote`
3. Set secrets: `wrangler secret put VENICE_API_KEY` and `wrangler secret put DVM_PRIVATE_KEY`
4. Deploy: `cd dvm-agent && npm run deploy`

Config vars are in `wrangler.toml`. Optional: `PINATA_JWT`, `IPFS_GATEWAY`. See `dvm-agent/README.md`.

### Test Commands

```bash
# Health check
curl https://dvm-agent.lynethlabs.workers.dev/health
```

### End-to-end test

1. `cd contracts && npm run testnet:flow:path-b-uma-escalate` – creates dispute, waits 180s, polls until DVM resolves.
2. Local DVM: `cd dvm-agent && npm run dev -- --test-scheduled` then `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`
3. Check disputes: `cd contracts && npm run check:disputes`
