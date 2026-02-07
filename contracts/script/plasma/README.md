# Plasma Testnet Scripts

Scripts for deploying and testing on Plasma testnet (chain ID 13473).

## Prerequisites

```bash
cd contracts
npm install
```

## Scripts

### 1. Deploy to Plasma Testnet

Deploy complete contract suite (AgentTaskEscrow, MockOOv3, MockERC20).

```bash
npx hardhat run script/plasma/deploy-plasma-testnet.ts --network plasma
```

This deploys:
- MockERC20 (USDC mock)
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
npx hardhat run script/plasma/mint-testnet-tokens.ts --network plasma
```

### 4. Print Testnet Addresses

Display deployed contract addresses from Plasma testnet.

```bash
npx hardhat run script/plasma/print-testnet-addresses.ts --network plasma
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
- Chain ID: `13473`
- RPC: Check hardhat.config.ts
- Native Token: ETH

## Common Workflows

### Initial Setup
```bash
# 1. Deploy contracts
npx hardhat run script/plasma/deploy-plasma-testnet.ts --network plasma

# 2. Mint test tokens
npx hardhat run script/plasma/mint-testnet-tokens.ts --network plasma

# 3. Check deployment
npx hardhat run script/plasma/print-testnet-addresses.ts --network plasma
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

### Path B: Client Dispute
- Client creates task
- Agent accepts with stake
- Agent asserts completion
- Client disputes within cooldown
- Client wins (receives payment back + slashed stake)

### Path C: UMA Escalation
- Client creates task
- Agent accepts with stake
- Agent asserts completion
- Client disputes
- Agent escalates to UMA
- UMA oracle resolves dispute
- Settlement based on oracle result

## Troubleshooting

### Deployment Fails
- Check you have ETH on Plasma testnet
- Verify RPC endpoint in hardhat.config.ts

### Transaction Reverts
- Ensure contracts are deployed first
- Check you have minted test tokens
- Verify allowances are set correctly
