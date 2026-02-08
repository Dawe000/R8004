# DVM Agent (UMA Dispute Resolution)

Cloudflare Worker that resolves UMA disputes for the AgentTaskEscrow system. Cron-triggered every 5 minutes; fetches escalated disputes, uses Venice AI to decide winner from evidence, and submits resolution via `MockOOv3.pushResolution`.

**References:** [UMA Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work) · [UMA DVM 2.0](https://docs.uma.xyz/protocol-overview/dvm-2.0)

## Overview

- **Event-based**: Queries `TaskDisputeEscalated` events (efficient, no O(n) RPC calls)
- **D1 state**: Tracks `last_checked_block` and `processed_assertions`
- **Venice AI**: Decides winner from task description, client/agent evidence, result
- **Resilient**: IPFS fetch failure → treats as no evidence, continues; 4xx/429 handling

## Setup

1. **Create D1 database**
   ```bash
   wrangler d1 create dvm-agent-state
   ```
   Add the returned `database_id` to `wrangler.toml`.

2. **Apply migrations**
   ```bash
   wrangler d1 migrations apply dvm-agent-state --remote
   ```

3. **Set secrets**
   ```bash
   wrangler secret put VENICE_API_KEY
   wrangler secret put DVM_PRIVATE_KEY
   ```

4. **Deploy**
   ```bash
   npm run deploy
   ```

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # fill VENICE_API_KEY, DVM_PRIVATE_KEY, etc.
npm run dev
```

Trigger cron locally: `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`

## Config

| Var | Required | Description |
|-----|----------|-------------|
| VENICE_API_KEY | yes (secret) | Venice AI API key |
| DVM_PRIVATE_KEY | yes (secret) | Wallet private key (needs gas on Plasma) |
| RPC_URL | no (in wrangler.toml) | Plasma testnet RPC |
| ESCROW_ADDRESS | no | From deployments/plasma-testnet.json |
| MOCK_OOv3_ADDRESS | no | From deployments/plasma-testnet.json |
| DEPLOYMENT_BLOCK | no | For event queries |
| PINATA_JWT | optional (secret) | Use Pinata IPFS gateway |
| IPFS_GATEWAY | optional | Override gateway URL |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Local dev with wrangler |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run typecheck` | Type check without emit |
| `npm run test:dispute` | Venice dispute resolution (no chain) |
