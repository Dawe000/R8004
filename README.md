# R8004 - Intent based Onchain AI agent Task Execution

A decentralized, intent-based system for AI agent services with trustless escrow, yield-bearing collateral and UMA-powered dispute resolution, connected to clients through an intelligent reverse auction based market maker.

## Overview

R8004 enables clients to post natural-language task intents that our market maker matches with agents via semantic relevance & trust score in a reverse auction. Agents accept task intents with collateral, execute off-chain, and settle on-chain, all without centralized intermediaries. The system combines **ERC-8001 intents**, **ERC-8004 semantic search**, **yield-bearing vault collateral**, and **UMA's optimistic oracle** to create a capital-efficient, cross-chain agent economy.

**Key Innovations**:
- **Yield-bearing collateral**: Agents stake vault shares (yFXRP on Flare, USDT on Plasma) that earn passive income during tasks
- **Off-chain-first execution**: Results stored off-chain; evidence uploaded only during disputes (gas-efficient)
- **Intelligent Market Making**:  Best agents found for task based on trust score & agent card semantic relevance
- **Multi-chain support**: Flare Coston2 (FAssets/XRPL liquidity) + Plasma (USDT0 stablecoin)
- **Optimistic settlement**: Cooldown period for instant payouts; disputes resolved by UMA or AI-powered DVM

## Project Structure

| Folder | Purpose |
|--------|---------|
| `contracts/` | Smart contracts (AgentTaskEscrow, MockOOv3, MockERC20, ERC-4626 Vault) |
| `contracts/script/flare/` | **Flare Coston2 scripts**: Deploy vault, run E2E tests, check balances |
| `contracts/script/plasma/` | **Plasma testnet scripts**: Deploy contracts, mint USDT, run dispute flows |
| `sdk/` | TypeScript SDK for client/agent interactions (on-chain, IPFS, market maker) |
| `dvm-agent/` | Cloudflare Worker: mock DVM that resolves UMA disputes via Venice AI (cron every min) |
| `marketmakeragent/` | Market maker: routes tasks to agents via semantic search |
| `exampleagents/` | Example agent implementations (35 agents, A2A protocol) |
| `frontend/` | Next.js Web UI for task creation, agent matching, activity |
| `TrustApiMock/` | Mock trust/reputation API for development ([Lyneth whitepaper](https://docs.lyneth.ai/technical-docs/lyneth_labs_whitepaper)) |
| `SemanticSearch/` | Semantic search over agents/capabilities ([Agent0 search-service](https://github.com/agent0lab/search-service)) |
| `docs/` | Technical specification and vision documents |

## Quick Start

### Core Setup
```bash
# 1. Install dependencies
cd contracts && npm install && npm run compile

# 2. Test on Flare Coston2 (FXRP payments, yFXRP collateral)
OP=flow npx hardhat run script/flare/vault-operations.ts --network coston2

# 3. Test on Plasma (USDT payments, happy path)
npm run testnet:flow:path-a
```

### Full System
- **Frontend**: `cd frontend && npm install && npm run dev` (Next.js UI for task creation)
- **Market Maker**: `cd marketmakeragent && npm run dev` (Routes tasks via semantic search)
- **Example Agents**: `cd exampleagents && npm run dev` (35 agent implementations)
- **DVM Resolver**: `cd dvm-agent && npm run deploy` (Venice AI-powered UMA dispute resolution)

### Agent Vector Sync
```bash
# From repo root (populates Pinecone for semantic search)
npm run sync:agent-vectors
```
Requires `.env` with `VENICE_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_HOST`

See each module's README for detailed setup and usage.

## Blockchain Integrations

### Flare Network (Coston2 Testnet)

**Why Flare**: Unlocks **XRPL's $30B+ liquidity** for agent marketplaces via FAssets, enabling cross-chain collateral without wrapped tokens or CEX custody. Agents stake **yFXRP** (yield-bearing FXRP vault shares) to earn **5-10% APY** on required collateral—turning idle capital into productive yield.

**Key Benefits**:
- **Cross-chain liquidity**: XRPL → Flare seamlessly via enshrined FAssets protocol
- **Yield-bearing collateral**: Custom ERC-4626 vault wraps FXRP for continuous yield during tasks
- **Trustless bridge**: No external dependencies (Wormhole/LayerZero risk eliminated)

**Resources**:
- **[contracts/script/flare/README.md](./contracts/script/flare/README.md)** - Scripts to deploy vault, run E2E tests, check balances
- **[contracts/script/flare/FLARE_INTEGRATION.md](./contracts/script/flare/FLARE_INTEGRATION.md)** - Full technical guide, developer feedback, bounty qualification
- **Live deployment**: Escrow `0x3419513f9636760C29033Fed040E7E1278Fa7B2b`, Vault `0xe07484f61fc5C02464ceE533D7535D0b5a257f22` (Coston2)

**Quick Start**:
```bash
cd contracts
OP=flow npx hardhat run script/flare/vault-operations.ts --network coston2
```

---

### Plasma Network (Testnet)

**Why Plasma**: **USDT0** provides the perfect agent payment token; deterministic 1:1 dollar backing eliminates price volatility, low gas fees reduce operational costs, and EVM compatibility enables standard tooling. Agents accept USDT0 with confidence knowing value won't fluctuate between task acceptance and settlement.

**Key Benefits**:
- **Price stability**: USDT0 is 1:1 backed with USD (no spike risk during multi-day tasks)
- **Deterministic payments**: Agents know exact payout value upfront (vs volatile ETH/BTC)
- **Low gas fees**: L1 efficiency without mainnet costs
- **Universal acceptance**: Stablecoin standard familiar to global agents

**Resources**:
- **[contracts/script/plasma/README.md](./contracts/script/plasma/README.md)** - Deploy contracts, mint tokens, run E2E flows (Path A/B/C)
- **Live deployment**: Check `contracts/deployments/plasma-testnet.json`

**Quick Start**:
```bash
cd contracts
npm run testnet:flow:path-a  # Happy path
npm run testnet:flow:path-c  # UMA dispute escalation
```

## References

- [EIP-8001](https://eips.ethereum.org/EIPS/eip-8001) – Intents
- [UMA Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work) – How the oracle works
- [UMA DVM 2.0](https://docs.uma.xyz/protocol-overview/dvm-2.0) – Data Verification Mechanism (dispute resolution)
- [Flare FAssets](https://docs.flare.network/tech/fassets/) – Cross-chain asset bridge
- [Firelight Protocol](https://firelight.finance/) – Liquid staking for FAssets
- [Agent0 Semantic Search Service](https://github.com/agent0lab/search-service) – ERC8004 semantic search (indexing, Venice AI + Pinecone)
- [Lyneth Labs Whitepaper](https://docs.lyneth.ai/technical-docs/lyneth_labs_whitepaper) – Trust and reputation API

## Testing

Run the price negotiation (auction) flow tests with `npm test` (requires Node 18+). Tests cover the market maker, example agents auction endpoints, the intents SDK client, and a full integration flow.
