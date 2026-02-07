# Deployed Workers

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
**Package**: `dvm-agent/`

Cron-triggered worker that resolves UMA disputes for AgentTaskEscrow:
- Runs every 5 minutes via Cloudflare Cron
- Fetches tasks with `EscalatedToUMA` status
- Uses Venice AI to decide winner from evidence (task description, client/agent evidence, result)
- Submits resolution via `MockOOv3.pushResolution(assertionId, agentWins)`
- Durable Object tracks processed assertion IDs for idempotency

### Setup

1. Copy `.dev.vars.example` to `.dev.vars` and set:
   - `VENICE_API_KEY` – Venice AI API key
   - `DVM_PRIVATE_KEY` – Wallet private key (needs XPL for gas on Plasma testnet)
   - `RPC_URL` – Plasma testnet RPC (default: https://testnet-rpc.plasma.to)
   - `ESCROW_ADDRESS`, `MOCK_OOv3_ADDRESS`, `DEPLOYMENT_BLOCK` – from `contracts/deployments/plasma-testnet.json`

2. Deploy:
   ```bash
   cd dvm-agent && npm install && wrangler secret put VENICE_API_KEY && wrangler secret put DVM_PRIVATE_KEY
   npm run deploy
   ```

### Test Commands

```bash
# Health check
curl https://dvm-agent.<subdomain>.workers.dev/health
```
