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
| `getMyTasks(inProgressOnly?)` | Get tasks created by this client (uses signer address). |
| `getTasksNeedingAction()` | Get tasks where client can act (dispute, settleAgentConceded, timeoutCancel). |
| `fetchEvidenceForTask(taskId, options?)` | Fetch client and agent evidence from task (from clientEvidenceURI, agentEvidenceURI). |
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
| `getMyTasks(inProgressOnly?)` | Get tasks accepted by this agent (uses signer address). |
| `getTasksNeedingAction()` | Get tasks where agent can act (settleNoContest, escalateToUMA). |

## Task Listing and Status Helpers

Standalone functions (Provider-only, no signer required):

| Function | Description |
|----------|-------------|
| `getNextTaskId(escrowAddress, provider)` | Get next task ID (total task count). |
| `getTask(escrowAddress, provider, taskId)` | Fetch task by ID. |
| `getTaskDescriptionUri(escrowAddress, provider, taskId)` | Fetch task description URI from TaskCreated event (null if none). |
| `getEscrowConfig(escrowAddress, provider)` | Fetch escrow timing and bond params (cooldownPeriod, agentResponseWindow, disputeBondBps, escalationBondBps, umaConfig). |
| `getTasksByClient(escrowAddress, provider, clientAddress)` | Get tasks created by client. |
| `getTasksByAgent(escrowAddress, provider, agentAddress)` | Get tasks accepted by agent. |
| `getTasksByIdRange(escrowAddress, provider, fromId, toId)` | Fetch tasks by ID range. |
| `getClientIntents(escrowAddress, provider, clientAddress, inProgressOnly?)` | Client intents (optionally in-progress only). |
| `getAgentCommitments(escrowAddress, provider, agentAddress, inProgressOnly?)` | Agent commitments (optionally in-progress only). |
| `getClientTasksNeedingAction(...)` | Tasks where client can take action. |
| `getAgentTasksNeedingAction(...)` | Tasks where agent can take action. |

Status helpers: `isInProgress(task)`, `isContested(task)`, `isResolved(task)`, `isCooldownExpired(task, blockTimestamp)`, `isDeadlinePassed(task, blockTimestamp)`.

Action helpers: `needsClientDisputeBond(task)`, `needsAgentEscalationBond(task)`, `canClientSettleAgentConceded(...)`, `canAgentSettleNoContest(...)`, `canClientTimeoutCancel(...)`.

Bond amounts: `getDisputeBondAmount(task, disputeBondBps)`, `getEscalationBondAmount(task, escalationBondBps, umaMinBond)`.

Use `getEscrowConfig` to obtain `agentResponseWindow`, `disputeBondBps`, and `umaConfig.minimumBond` for status helpers and bond calculations. Use `getTaskDescriptionUri` with `fetchFromIpfs` to load task spec when deciding whether to dispute.

## IPFS Fetch (Evidence)

Read content from IPFS URIs (no API key needed):

| Function | Description |
|----------|-------------|
| `fetchFromIpfs(uri, options?)` | Fetch content at ipfs://CID or https://gateway/ipfs/CID. Options: `gateway`, `asJson`. |
| `fetchClientEvidence(uri, options?)` | Fetch content at client evidence URI. |
| `fetchAgentEvidence(uri, options?)` | Fetch content at agent evidence URI. |
| `fetchTaskEvidence(task, options?)` | Fetch both clientEvidenceURI and agentEvidenceURI; returns `{ clientEvidence?, agentEvidence? }`. Skips empty URIs. |

Default gateway: `https://ipfs.io/ipfs/`. Use `asJson: true` to parse JSON.

## Cron Agent Flow

Autonomous cron agents can check statuses, inspect evidence, and decide whether to dispute:

1. `clientSdk.getTasksNeedingAction()` – tasks where client can act
2. For each task with `needsClientDisputeBond(task) && !isCooldownExpired(task, blockTimestamp)`: fetch evidence via `fetchFromIpfs(task.clientEvidenceURI)` or `clientSdk.fetchEvidenceForTask(taskId)`
3. Apply custom logic (e.g. LLM, rules) to decide whether to dispute
4. If dispute: `clientSdk.disputeTask(taskId, evidenceObject)` (uploads new evidence) or pass existing URI
5. For `canClientSettleAgentConceded`: `clientSdk.settleAgentConceded(taskId)`
6. For `canClientTimeoutCancel`: `clientSdk.timeoutCancellation(taskId, reason)`

Example:

```typescript
const tasks = await clientSdk.getTasksNeedingAction();
for (const task of tasks) {
  if (needsClientDisputeBond(task) && !isCooldownExpired(task, Date.now() / 1000)) {
    const evidence = await clientSdk.fetchEvidenceForTask(task.id, { asJson: true });
    if (shouldDispute(evidence)) await clientSdk.disputeTask(task.id, { reason: "..." });
  }
  if (canClientSettleAgentConceded(task, Date.now() / 1000, agentResponseWindow))
    await clientSdk.settleAgentConceded(task.id);
  if (canClientTimeoutCancel(task, Date.now() / 1000))
    await clientSdk.timeoutCancellation(task.id, "deadline exceeded");
}
```

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

## Live Plasma Testnet Testing

Run read-only tests against Plasma testnet (chainId 9746):

```bash
export SDK_LIVE_TESTNET=1
export MNEMONIC="your twelve word mnemonic"
cd sdk && npm run test:live
```

Tests: `getNextTaskId`, `getTask`, `getTasksByClient`, `getTasksByAgent`, status helpers, `getMyTasks`, `getTasksNeedingAction`.

Optional: set `SDK_LIVE_RUN_FLOW=1` to run a full Path A flow (creates task, costs tokens).

## Scripts

- `npm run build` - Compile TypeScript
- `npm test` - Run unit tests (excludes integration and live)
- `npm run test:integration` - Run integration tests (requires env vars)
- `npm run test:live` - Run live Plasma testnet tests (requires SDK_LIVE_TESTNET=1, MNEMONIC)
- `npm run typecheck` - Type check without emit
