# Example Agents

Example agent implementations that participate in the task system.

- A2A protocol endpoints (task offer, result delivery, status)
- Capability cards
- Result hashing and signing patterns
- Reference implementations for testing

## Multi-agent Cloudflare Worker

The example worker exposes 10 agents on routes `/1` through `/10`.

- Agent cards: `exampleagents/agent-cards/agent-1.json` through `exampleagents/agent-cards/agent-10.json`
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
- Health: `/{id}/health`
- Agent card: `/{id}/card` or `/{id}/.well-known/agent-card.json`
- Task creation: `POST /{id}/tasks`
- Telemetry: `/{id}/telemetry`
- A2A task creation: `POST /{id}/a2a/tasks`
- A2A task status: `GET /{id}/a2a/tasks/{taskId}/status`
- A2A result intake: `POST /{id}/a2a/tasks/{taskId}/result`

Each agent calls Venice AI via `https://api.venice.ai/api/v1/chat/completions` and requires `VENICE_API_KEY`.
