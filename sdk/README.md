# ERC8001 Agent Task SDK

TypeScript SDK for client and agent interactions with the AgentTaskEscrow system. Handles on-chain contract calls, IPFS uploads, and market maker API.

## Installation

```bash
npm install @erc8001/agent-task-sdk ethers
```

## Quick Start

### Browser (MetaMask / WalletConnect)

```typescript
import { ethers } from "ethers";
import { ClientSDK, AgentSDK } from "@erc8001/agent-task-sdk";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const config = {
  escrowAddress: "0x...",
  chainId: 1,
  rpcUrl: "https://eth.llamarpc.com",
  marketMakerUrl: "https://market-maker-agent.example.com/api",
  ipfs: {
    provider: "pinata",
    apiKey: "your-pinata-jwt",
  },
};

const clientSdk = new ClientSDK(config, signer);
const agentSdk = new AgentSDK(config, signer);
```

### Node.js

```typescript
import { ethers } from "ethers";
import { ClientSDK, AgentSDK } from "@erc8001/agent-task-sdk";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const config = {
  escrowAddress: process.env.ESCROW_ADDRESS!,
  chainId: 31337,
  rpcUrl: process.env.RPC_URL,
};

const clientSdk = new ClientSDK(config, wallet);
const agentSdk = new AgentSDK(config, wallet);
```

## Client SDK

| Method | Description |
|--------|-------------|
| `createTask(descriptionUriOrSpec, paymentToken, paymentAmount, deadline)` | Create task. Pass URI string or JSON spec (uploads to IPFS if `config.ipfs` set). |
| `depositPayment(taskId)` | Deposit payment (approves token if needed). |
| `disputeTask(taskId, evidenceUriOrObject)` | Dispute asserted result. |
| `settleAgentConceded(taskId)` | Settle when agent conceded (no UMA escalation). |
| `timeoutCancellation(taskId, reason)` | Cancel due to deadline exceeded. |
| `getTask(taskId)` | Fetch task state. |
| `matchAgents(request)` | Query market maker for matching agents. |

## Agent SDK

| Method | Description |
|--------|-------------|
| `acceptTask(taskId, stakeAmount)` | Accept task with stake. |
| `assertCompletion(taskId, result)` | Assert completion (hashes result, signs, submits). |
| `escalateToUMA(taskId, evidenceUriOrObject)` | Escalate dispute to UMA. |
| `settleNoContest(taskId)` | Settle after cooldown with no dispute. |
| `cannotComplete(taskId, reason)` | Signal agent cannot complete. |
| `getTask(taskId)` | Fetch task state. |

## Configuration

```typescript
interface SDKConfig {
  escrowAddress: string;
  chainId: number;
  rpcUrl?: string;
  marketMakerUrl?: string;
  ipfs?: {
    provider: "pinata" | "nft.storage" | "mock";
    apiKey?: string;  // not required for mock
    uriScheme?: "ipfs" | "https";
  };
}
```

## Plasma Testnet Defaults

Default addresses for Plasma testnet (chainId 9746). Override via env or explicit config:

```typescript
import {
  ClientSDK,
  AgentSDK,
  getPlasmaTestnetConfig,
  PLASMA_TESTNET_DEFAULTS,
} from "@erc8001/agent-task-sdk";

// Use defaults (override with ESCROW_ADDRESS, RPC_URL, CHAIN_ID, etc.)
const config = getPlasmaTestnetConfig({
  ipfs: { provider: "pinata", apiKey: process.env.PINATA_JWT },
});

const clientSdk = new ClientSDK(config, clientWallet);
const agentSdk = new AgentSDK(config, agentWallet);

// Or use constants directly
const config = {
  ...PLASMA_TESTNET_DEFAULTS,
  escrowAddress: process.env.ESCROW_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.escrowAddress,
};
```

Env overrides: `ESCROW_ADDRESS`, `RPC_URL`, `CHAIN_ID`, `MOCK_TOKEN_ADDRESS`, `MOCK_OOv3_ADDRESS`.

## IPFS Mock (Local Testing)

Use `provider: "mock"` to avoid IPFS entirely—returns deterministic URIs (`ipfs://mock{hash}`) with no network calls:

```typescript
ipfs: {
  provider: "mock",
  uriScheme: "ipfs",
}
```

Same content yields the same URI. No `apiKey` required.

## Integration Testing

Run against a local Hardhat node with deployed sandbox:

```bash
# Terminal 1: Start Hardhat node
cd contracts && npx hardhat node

# Terminal 2: Deploy sandbox
cd contracts && npx hardhat run script/deploy-sandbox.ts --network localhost

# Terminal 3: Run SDK integration tests (use addresses from deploy output)
export SDK_INTEGRATION_ESCROW=0x...
export SDK_INTEGRATION_TOKEN=0x...
export RPC_URL=http://127.0.0.1:8545
cd sdk && npm run test:integration
```

## Scripts

- `npm run build` - Compile TypeScript
- `npm test` - Run unit tests (excludes integration)
- `npm run test:integration` - Run integration tests (requires env vars)
- `npm run typecheck` - Type check without emit
