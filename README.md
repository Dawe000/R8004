# ERC8001 Agent Task System

An intent-based system for agent tasks with a market maker and UMA-based dispute resolution.

## Overview

This project implements the ERC8001 Agent Task System—enabling clients to create natural-language task intents, agents to accept and execute them with stake, and UMA to secure disputed outcomes. Normal flows avoid UMA/IPFS entirely; disputes escalate only when needed.

## Project Structure

| Folder | Purpose |
|--------|---------|
| `contracts/` | Smart contracts (AgentTaskEscrow, MockOOv3, MockERC20) |
| `sdk/` | TypeScript SDK for client/agent interactions (on-chain, IPFS, market maker) |
| `dvm-agent/` | Cloudflare Worker: resolves UMA disputes via Venice AI (cron every 5 min) |
| `marketmakeragent/` | Market maker: routes tasks to agents via semantic search |
| `exampleagents/` | Example agent implementations (35 agents, A2A protocol) |
| `frontend/` | Next.js Web UI for task creation, agent matching, activity |
| `TrustApiMock/` | Mock trust/reputation API for development |
| `SemanticSearch/` | ERC8004-backed semantic search over agents/capabilities |
| `docs/` | Technical specification and vision documents |

## Quick Start

- **Contracts:** `cd contracts && npm install && npm run compile`
- **SDK:** `npm install @erc8001/agent-task-sdk ethers` – see `sdk/README.md`
- **Frontend:** `cd frontend && npm install && npm run dev` – see `frontend/README.md`
- **Plasma testnet flows:** `cd contracts && npm run testnet:flow:path-a`
- **DVM (dispute resolution):** `cd dvm-agent && npm run deploy` – see `dvm-agent/README.md`

From repo root: `npm run sync:agent-vectors` populates Pinecone for the market maker and example agents (requires `VENICE_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_HOST` in root `.env`; see `exampleagents/README.md` and `marketmakeragent/README.md`).

See each module's README for setup and usage.

## References

- [EIP-8001](https://eips.ethereum.org/EIPS/eip-8001) – Intents
- [UMA Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work)
## Testing

Run the price negotiation (auction) flow tests with `npm test` (requires Node 18+). Tests cover the market maker, example agents auction endpoints, the intents SDK client, and a full integration flow.
