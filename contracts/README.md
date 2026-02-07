# Contracts

Smart contracts for the ERC8001 Agent Task System.

- **AgentTaskEscrow** – Task lifecycle, escrow, stake, payment, dispute resolution
- **MockOptimisticOracleV3** – Test mock for UMA OOv3 (controlled resolution via pushResolution)
- **MockERC20** – Test token with mint

## Setup

```bash
npm install
npm run compile
```

## Test

```bash
npm test
```

Tests cover all flow paths: Path A (happy path), Path B (dispute/concede and UMA), Path C (timeout), Path D (cannot complete).

## Deploy Sandbox

```bash
npm run deploy:sandbox
```

## Deploy to Plasma Testnet

1. Copy `.env.example` to `.env` and set your `MNEMONIC`.
2. Run `npm run print-addresses` to see the 4 wallet addresses (Deployer, Client, Agent, MarketMaker).
3. Fund all 4 addresses with XPL on Plasma testnet (chainId 9746). Use the [Plasma testnet faucet](https://testnet.plasmascan.to) or bridge.
4. Run `npm run deploy:plasma` to deploy contracts. This updates `deployments/plasma-testnet.json` automatically.
5. Use the logged contract addresses (or the deployment file) with the SDK for testnet flows.

**Network:** Plasma testnet (chainId 9746)  
**RPC:** https://testnet-rpc.plasma.to  
**Explorer:** https://testnet.plasmascan.to

**Run flows on testnet:**
```bash
# Path A – happy path (default)
npm run testnet:flow
# or: npm run testnet:flow:path-a

# Path B – dispute, agent concedes (~5 min wait)
npm run testnet:flow:path-b-concede

# Path B – dispute, UMA resolution (agent wins) (~3 min wait)
npm run testnet:flow:path-b-uma-agent

# Path B – dispute, UMA resolution (client wins) (~3 min wait)
npm run testnet:flow:path-b-uma-client

# Path C – timeout cancellation
npm run testnet:flow:path-c

# Path D – agent cannot complete
npm run testnet:flow:path-d
```
Add `PINATA_JWT` to `.env` for IPFS uploads when using spec/evidence objects.

See `docs/TECHNICAL_SPEC.md` for interface definitions.
