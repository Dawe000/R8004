# Trust API Mock

Mock trust/reputation API for development and testing.

- Returns trust scores and optional reputation signals for agents
- Simulates the ERC8004 trust layer
- Used by the market maker for agent evaluation and `minReputationScore` filtering (see [TECHNICAL_SPEC](../docs/TECHNICAL_SPEC.md))
- **Stack:** Cloudflare Worker + D1 (SQLite)

**Reference:** [Lyneth Labs Whitepaper](https://docs.lyneth.ai/technical-docs/lyneth_labs_whitepaper) — trust and reputation model.

Agent identifiers (`agentId`) match the example agents in `exampleagents/` (routes `/1`–`/10`). No authentication in this mock (development only).

---

## Setup

1. **Create the D1 database** (requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) and a Cloudflare account):

   ```bash
   cd TrustApiMock
   npx wrangler d1 create trust-api-db
   ```

   Copy the `database_id` from the output.

2. **Bind the database in `wrangler.toml`:**

   Replace `YOUR_D1_DATABASE_ID` in `wrangler.toml` with the `database_id` from step 1 (or use the value already present if the database was created earlier).

3. **Run migrations** (creates the `agent_trust` table and seeds agents `1`–`10` with score 75):

   **Remote (for deployed worker):**

   ```bash
   npx wrangler d1 migrations apply trust-api-db --remote
   ```

   **Local (for `wrangler dev`):**

   ```bash
   npx wrangler d1 migrations apply trust-api-db --local
   ```

   Alternatively, run the SQL file directly:

   ```bash
   npx wrangler d1 execute trust-api-db --remote --file=./migrations/0000_init_agent_trust.sql
   npx wrangler d1 execute trust-api-db --local --file=./migrations/0000_init_agent_trust.sql
   ```

4. **Run the worker:**

   - **Local:** `npx wrangler dev` (default: `http://localhost:8787`)
   - **Deploy:** see [Deploy](#deploy) below

---

## Endpoints

Base URL: the worker URL (e.g. `https://trust-api-mock.<your-subdomain>.workers.dev` when deployed, or `http://localhost:8787` with `wrangler dev`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info and list of endpoints |
| GET | `/trust` | List all agent trust scores |
| GET | `/trust/:agentId` | Get trust score for one agent |
| PUT | `/trust/:agentId` | Create or update trust score for an agent |

---

### GET `/`

Returns a short description and the available endpoint paths.

**Response:** `200 OK`

```json
{
  "message": "Trust API Mock",
  "endpoints": [
    "GET /trust",
    "GET /trust/:agentId",
    "PUT /trust/:agentId"
  ]
}
```

---

### GET `/trust`

Returns trust scores for all agents stored in the database (e.g. agents `1`–`10` after seeding).

**Response:** `200 OK`

**Body:**

| Field | Type | Description |
|-------|------|-------------|
| `agents` | array | List of agent trust objects (see below) |

Each element has:

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | string | Agent identifier (e.g. `"1"`–`"10"`) |
| `score` | number | Trust/reputation score (0–100) |
| `signals` | object \| null | Optional reputation signals (e.g. `tasksCompleted`, `disputes`) |
| `updatedAt` | number | Unix timestamp of last update |

**Example:**

```bash
curl https://trust-api-mock.<your-subdomain>.workers.dev/trust
```

```json
{
  "agents": [
    { "agentId": "1", "score": 75, "signals": null, "updatedAt": 1738828800 },
    { "agentId": "2", "score": 75, "signals": null, "updatedAt": 1738828800 }
  ]
}
```

---

### GET `/trust/:agentId`

Returns the trust score for a single agent.

**Parameters:**

| Name | Location | Type | Description |
|------|----------|------|-------------|
| `agentId` | path | string | Agent identifier (e.g. `1`, `2`, … `10`) |

**Response:** `200 OK`

**Body:** Single agent trust object:

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | string | Agent identifier |
| `score` | number | Trust/reputation score (0–100) |
| `signals` | object \| null | Optional reputation signals |
| `updatedAt` | number | Unix timestamp of last update |

**Example:**

```bash
curl https://trust-api-mock.<your-subdomain>.workers.dev/trust/1
```

```json
{
  "agentId": "1",
  "score": 75,
  "signals": null,
  "updatedAt": 1738828800
}
```

**Error:** `404 Not Found` if no row exists for `agentId`.

```json
{
  "error": "Agent not found",
  "agentId": "99"
}
```

---

### PUT `/trust/:agentId`

Creates or updates the trust score for an agent (upsert). Used for seeding data or simulating reputation changes.

**Parameters:**

| Name | Location | Type | Description |
|------|----------|------|-------------|
| `agentId` | path | string | Agent identifier (e.g. `1`–`10`) |

**Request body:** JSON

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `score` | number | yes | Trust/reputation score; must be an integer in 0–100 |
| `signals` | object | no | Optional reputation signals (any JSON object; stored as-is) |

**Response:** `200 OK`

**Body:** The stored agent trust object (same shape as GET `/trust/:agentId`).

**Example:**

```bash
curl -X PUT https://trust-api-mock.<your-subdomain>.workers.dev/trust/1 \
  -H "Content-Type: application/json" \
  -d '{"score": 80, "signals": {"tasksCompleted": 10, "disputes": 0}}'
```

```json
{
  "agentId": "1",
  "score": 80,
  "signals": { "tasksCompleted": 10, "disputes": 0 },
  "updatedAt": 1738828900
}
```

**Errors:**

- `400 Bad Request` — Invalid or missing JSON, or `score` not an integer in 0–100.

```json
{
  "error": "score must be an integer between 0 and 100"
}
```

---

## Deploy

1. Ensure `workers_dev = true` in `wrangler.toml` (already set for workers.dev).
2. **One-time:** Register a workers.dev subdomain if you have not already:
   - Open [Workers & Pages → onboarding](https://dash.cloudflare.com/workers/onboarding) in the Cloudflare dashboard.
   - Choose and confirm your `*.workers.dev` subdomain.
3. From the project root:

   ```bash
   cd TrustApiMock
   npx wrangler deploy
   ```

4. The worker will be available at:
   `https://trust-api-mock.<your-subdomain>.workers.dev`

5. Ensure migrations have been applied to the **remote** D1 database (see [Setup](#setup) step 3) so the deployed worker has the `agent_trust` table and seed data.

---

## Example requests (local)

With `npx wrangler dev` running (default port 8787):

```bash
# Service info
curl http://localhost:8787/

# All agents
curl http://localhost:8787/trust

# One agent
curl http://localhost:8787/trust/1

# Update agent 1
curl -X PUT http://localhost:8787/trust/1 \
  -H "Content-Type: application/json" \
  -d '{"score": 80, "signals": {"tasksCompleted": 10}}'
```
