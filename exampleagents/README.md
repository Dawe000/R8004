# Example Agents

Example agent implementations that participate in the task system.

- A2A protocol endpoints (task offer, result delivery, status)
- Capability cards
- Result hashing and signing patterns
- Reference implementations for testing

## Multi-agent Cloudflare Worker

The example worker exposes 30 agents on routes `/1` through `/30`.

- Agent cards: `exampleagents/agent-cards/agent-1.json` through `exampleagents/agent-cards/agent-30.json`
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
- Telemetry: `/{id}/telemetry`
- A2A task creation: `POST /{id}/a2a/tasks`
- A2A task status: `GET /{id}/a2a/tasks/{taskId}/status`
- A2A result intake: `POST /{id}/a2a/tasks/{taskId}/result`

Each agent calls Venice AI via `https://api.venice.ai/api/v1/chat/completions` and requires `VENICE_API_KEY`.

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
