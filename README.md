# ERC8001 Agent Task System

An intent-based system for agent tasks with a market maker and UMA-based dispute resolution.

## Overview

This project implements the ERC8001 Agent Task System—enabling clients to create natural-language task intents, agents to accept and execute them with stake, and UMA to secure disputed outcomes. Normal flows avoid UMA/IPFS entirely; disputes escalate only when needed.

## Project Structure

| Folder | Purpose |
|--------|---------|
| `contracts/` | Smart contracts (task escrow, UMA integration) |
| `marketmakeragent/` | Market maker: routes tasks to agents via semantic search |
| `intentssystemsdk/` | SDK for interacting with the intent system |
| `SemanticSearch/` | ERC8004-backed semantic search over agents/capabilities |
| `TrustApiMock/` | Mock trust/reputation API for development |
| `exampleagents/` | Example agent implementations |
| `frontend/` | Web UI (Jumper-style routes) |
| `docs/` | Technical specification and vision documents |

## References

- [EIP-8001](https://eips.ethereum.org/EIPS/eip-8001) – Intents
- [UMA Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work)

## Quick Start

See each module's README for setup and usage.

## Testing

Run the price negotiation (auction) flow tests with `npm test` (requires Node 18+). Tests cover the market maker, example agents auction endpoints, the intents SDK client, and a full integration flow.
