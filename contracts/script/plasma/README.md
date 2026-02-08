# Plasma Testnet Scripts

Scripts for deploying and testing on Plasma testnet (chain ID 13473).

## Prerequisites

```bash
cd contracts
npm install
```

## Scripts

### 1. Deploy to Plasma Testnet

Deploy complete contract suite (AgentTaskEscrow, MockOOv3, and optionally MockERC20).

**Option A – Mock token (default):** Deploys MockERC20, mints to client/agent, escrow whitelists it.

```bash
npx hardhat run script/plasma/deploy-plasma-testnet.ts --network plasma-testnet
```

**Option B – Testnet USDT only:** Escrow whitelists only the official Plasma testnet USDT (no mock token, no mint). Client and agent must hold testnet USDT separately.

```bash
PLASMA_USE_TESTNET_USDT=1 npx hardhat run script/plasma/deploy-plasma-testnet.ts --network plasma-testnet
```

Testnet USDT0 contract address: `0x502012b361AebCE43b26Ec812B74D9a51dB4D412` ([testnet.plasmascan.to](https://testnet.plasmascan.to/token/0x502012b361AebCE43b26Ec812B74D9a51dB4D412)).

Default deploy deploys:
- MockERC20 (test token)
- MockOptimisticOracleV3
- AgentTaskEscrow

### 2. Deploy to Sandbox (Local Hardhat Network)

Deploy contracts to local Hardhat network for development.

```bash
npx hardhat run script/plasma/deploy-sandbox.ts
```

### 3. Mint Testnet Tokens

Mint mock USDC tokens for testing on Plasma.

```bash
npx hardhat run script/plasma/mint-testnet-tokens.ts --network plasma-testnet
```

### 4. Print Testnet Addresses

Display deployed contract addresses from Plasma testnet.

```bash
npx hardhat run script/plasma/print-testnet-addresses.ts --network plasma-testnet
```

### 5. Run Complete E2E Flow

Execute full task lifecycle on Plasma testnet.

```bash
# Path A: Happy path (no disputes)
cd contracts
npm run testnet:flow:path-a

# Path B: Client disputes
npm run testnet:flow:path-b

# Path C: Agent escalates to UMA
npm run testnet:flow:path-c
```

**What it does**:
1. Creates a task with USDC payment
2. Agent accepts and stakes USDC
3. Agent completes task
4. Settlement (varies by path)

## Network Configuration

**Plasma Testnet**
- Network name: `plasma-testnet`
- Chain ID: `9746`
- RPC: `https://testnet-rpc.plasma.to` (or `PLASMA_RPC_URL` in .env)
- Native Token: ETH

## Common Workflows

### Initial Setup
```bash
# 1. Deploy contracts
npx hardhat run script/plasma/deploy-plasma-testnet.ts --network plasma-testnet

# 2. Mint test tokens
npx hardhat run script/plasma/mint-testnet-tokens.ts --network plasma-testnet

# 3. Check deployment
npx hardhat run script/plasma/print-testnet-addresses.ts --network plasma-testnet
```

### Test E2E Flow
```bash
cd contracts
npm run testnet:flow:path-a
```

## Flow Paths

### Path A: Happy Path
- Client creates task
- Agent accepts with stake
- Agent completes task
- 24hr cooldown
- Settlement (agent receives payment + stake back)

### Path B: Client Dispute (no UMA)
- `npm run testnet:flow:path-b-concede` – client disputes, agent does nothing, after response window client calls `settleAgentConceded`. No DVM.

### Path B: UMA escalation (test DVM)
- `npm run testnet:flow:path-b-uma-escalate` – client disputes, agent escalates to UMA, then **DVM worker** (cron) resolves via `pushResolution`. Requires:
  - **PINATA_JWT** in `contracts/.env` or `sdk/.env` (IPFS uploads for dispute/evidence).
  - **Agent** gets escalation bond topped up by the script from Client if needed (testnet escrow uses small `UMA_MINIMUM_BOND`).
  - **DVM worker** deployed and cron running (or trigger manually); script polls until task status is Resolved (or 10 min timeout).

### Path C: UMA Escalation
- Same as path-b-uma-* but different resolution path (see script).

---

## E2E tests and wallet funding

**From `contracts/` (Plasma testnet):**

| Script | What it does |
|--------|----------------|
| `npm run testnet:flow:path-a` | Happy path: create → accept → deposit → assert → cooldown → settle (no dispute) |
| `npm run testnet:flow:path-b-concede` | Client disputes, agent does nothing; after window client calls settleAgentConceded |
| `npm run testnet:flow:path-b-uma-escalate` | Client disputes, agent escalates to UMA; DVM cron resolves; script polls until Resolved |
| `npm run testnet:flow:path-b-uma-agent` | Same + script pushes resolution (agent wins) |
| `npm run testnet:flow:path-b-uma-client` | Same + script pushes resolution (client wins) |
| `npm run check:disputes` | List escalated disputes and liveness (Plasma escrow) |

**Wallets (from `MNEMONIC` in `contracts/.env`):**

```bash
cd contracts
MNEMONIC="your twelve word phrase" npm run print-addresses
```

| Role | Derivation | Fund with (Plasma testnet) |
|------|------------|----------------------------|
| Deployer | m/44'/60'/0'/0/0 | XPL (gas for deploy) |
| **Client** | m/44'/60'/0'/0/1 | XPL (gas) + **USDT0** (payment + dispute bond) |
| **Agent** | m/44'/60'/0'/0/2 | XPL (gas) + **USDT0** (stake; escalation bond topped up by script if needed) |
| MarketMaker | m/44'/60'/0'/0/3 | XPL (gas; used by escrow config) |

- **USDT0** (Plasma): `0x502012b361AebCE43b26Ec812B74D9a51dB4D412` — get from faucet/bridge.
- **XPL**: native gas token on Plasma testnet.

**DVM worker wallet (for path-b-uma-escalate resolution):**

```bash
cd dvm-agent
npm run print-dvm-address   # uses DVM_PRIVATE_KEY from .dev.vars or env
```

Fund that address with **XPL** (Plasma) and **C2FLR** (Flare Coston2) so the worker can send `pushResolution` on both chains.

## Troubleshooting

### Deployment Fails
- Check you have ETH on Plasma testnet (for gas)
- Set `MNEMONIC` or `DEPLOYER_PRIVATE_KEY` in `contracts/.env`
- Verify RPC: `PLASMA_RPC_URL` or default `https://testnet-rpc.plasma.to`

### Transaction Reverts
- Ensure contracts are deployed first
- Check you have minted test tokens
- Verify allowances are set correctly
