# DVM Agent (UMA Dispute Resolution)

Cloudflare Worker that resolves UMA disputes for the AgentTaskEscrow system. Cron-triggered every 5 minutes; fetches escalated disputes (Plasma testnet + Flare Coston2), uses Venice AI to decide winner from evidence, and submits resolution via `MockOOv3.pushResolution`. Same flow for both chains.

**References:** [UMA Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work) · [UMA DVM 2.0](https://docs.uma.xyz/protocol-overview/dvm-2.0)

## Overview

- **Event-based**: Queries `TaskDisputeEscalated` events (efficient, no O(n) RPC calls)
- **D1 state**: Tracks `last_checked_block` per escrow and `processed_assertions` (shared)
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

Plasma and Flare Coston2 use the same resolution logic; each cron run processes both.

| Var | Required | Description |
|-----|----------|-------------|
| VENICE_API_KEY | yes (secret) | Venice AI API key |
| DVM_PRIVATE_KEY | yes (secret) | Wallet private key (needs gas on Plasma and Coston2) |
| RPC_URL | no | Plasma testnet RPC |
| ESCROW_ADDRESS | no | Plasma escrow (SDK default if omitted) |
| MOCK_OOv3_ADDRESS | no | Plasma MockOOv3 |
| DEPLOYMENT_BLOCK | no | Plasma escrow deployment block |
| FLARE_RPC_URL | no | Coston2 RPC (SDK default if omitted) |
| FLARE_ESCROW_ADDRESS | no | Coston2 escrow |
| FLARE_MOCK_OOv3_ADDRESS | no | Coston2 MockOOv3 |
| FLARE_DEPLOYMENT_BLOCK | no | Coston2 escrow deployment block |
| PINATA_JWT | optional (secret) | Use Pinata IPFS gateway |
| IPFS_GATEWAY | optional | Override gateway URL |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Local dev with wrangler |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run typecheck` | Type check without emit |
| `npm run test:dispute` | Venice dispute resolution (no chain) |
