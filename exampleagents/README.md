# Example Agents

Example agent implementations that participate in the task system.

- A2A protocol endpoints (task offer, result delivery, status)
- Capability cards
- Result hashing and signing patterns
- Reference implementations for testing

## Multi-agent Cloudflare Worker

The example worker exposes 35 agents on routes `/1` through `/35`. Agent IDs match `exampleagents/agent-cards/agent-{n}.json`.

- Agent cards: `exampleagents/agent-cards/agent-1.json` through `exampleagents/agent-cards/agent-35.json`
- Worker file: `exampleagents/example-agents-worker.js`

## Testing

From `exampleagents/`, run:

```
node tests/agent-tests.js
```

If you want to skip the Venice AI integration test:

```
node tests/agent-tests.js --skip-venice
```

To test a deployed Worker, provide the base URL and use `--remote`:

```
AGENT_BASE_URL=https://example-agent.<your-account>.workers.dev node tests/agent-tests.js --remote
```

The local test runner applies D1 migrations before starting `wrangler dev`.

## Task Persistence

Tasks are stored in Cloudflare D1 (`tasks` table) and retained for 7 days. The worker uses:

- Sync-first execution (default 20s budget) for `POST /{id}/tasks` and `POST /{id}/a2a/tasks`
- Async fallback via Cloudflare Queue when sync budget is exceeded
- D1-backed retrieval on `GET /{id}/tasks/{taskId}` and `GET /{id}/a2a/tasks/{taskId}/status`
- Scheduled cleanup via cron (`0 */6 * * *`)

Setup commands:

```bash
wrangler d1 create example-agent-tasks
wrangler queues create example-agent-task-exec
wrangler d1 migrations apply example-agent-tasks --local
wrangler d1 migrations apply example-agent-tasks --remote
wrangler deploy
```

Update `exampleagents/wrangler.toml` with your real D1 `database_id` before deploying.

- Health: `/{id}/health`
- Agent card: `/{id}/card` or `/{id}/.well-known/agent-card.json`
- Task creation: `POST /{id}/tasks`
- Task status/result: `GET /{id}/tasks/{taskId}`
- ERC8001 payment alert: `POST /{id}/erc8001/payment-deposited`
- Telemetry: `/{id}/telemetry`
- A2A task creation: `POST /{id}/a2a/tasks`
- A2A task status: `GET /{id}/a2a/tasks/{taskId}/status`
- A2A result intake: `POST /{id}/a2a/tasks/{taskId}/result`
- **Auction join:** `POST /{id}/a2a/auction/join` (market maker calls with task intent; agent returns initial bid + minAmount)
- **Auction bid update:** `POST /{id}/a2a/auction/{auctionId}/bid` (market maker sends market state; agent returns updated bid or minAmount)

Each agent calls Venice AI via `https://api.venice.ai/api/v1/chat/completions` and requires `VENICE_API_KEY`.

## ERC8001 On-Chain Test Flow

For ERC8001 dispatches (`POST /{id}/tasks` payload containing `erc8001`), the worker now:

1. Calls on-chain `acceptTask(taskId, stake)` with the agent signer.
2. Pauses execution until client sends `POST /{id}/erc8001/payment-deposited` with `onchainTaskId`.
3. On alert, verifies `paymentDeposited(taskId) == true`.
4. Resolves input from on-chain `TaskCreated.descriptionURI` and fetches the payload from IPFS.
5. Executes the task using that on-chain/IPFS payload.
6. Persists the result in D1.
7. Calls `assertCompletion(taskId, resultPayload, resultURI)` where `resultURI` points to `/{id}/tasks/{runId}`.

Dispatch payload should include ERC8001 metadata and optional skill/model only:

```json
{
  "task": {
    "skill": "optional-skill-id",
    "model": "optional-model-id"
  },
  "erc8001": {
    "taskId": "123",
    "stakeAmountWei": "1000000000000000",
    "publicBaseUrl": "https://example-agent....workers.dev"
  }
}
```

If payment is not yet visible at alert time, the endpoint returns HTTP `409`.

Required worker config:

- `AGENT_EVM_PRIVATE_KEY` (secret; funded test key used for accept/assert)
- `ERC8001_CHAIN_ID`
- `ERC8001_RPC_URL`
- `ERC8001_ESCROW_ADDRESS`
- `ERC8001_DEPLOYMENT_BLOCK` (recommended for efficient `TaskCreated` event lookup)
- `ERC8001_PUBLIC_BASE_URL`

Optional:

- none required for payment waiting (polling removed in favor of client alert)

## Pinecone Vector Sync

After deploying test agents with `wrangler deploy`, run this from repo root to generate Venice embeddings from `exampleagents/agent-cards` and upsert them to Pinecone:

```bash
npm run sync:agent-vectors
```

Required root `.env` values:

```
VENICE_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_HOST=https://ethoxford-to38e6r.svc.aped-4627-b74a.pinecone.io
```
