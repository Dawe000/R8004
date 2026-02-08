# ERC8001 Agent Task System – Technical Specification

**Version:** 1.0.0

**Last Updated:** February 7, 2026

---

## 1. Smart Contract Interfaces

### 1.1 Core Task Escrow Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IAgentTaskEscrow {
    // --- Enums ---

    enum TaskStatus {
        None,
        Created,
        Accepted,
        ResultAsserted,
        DisputedAwaitingAgent,
        EscalatedToUMA,
        TimeoutCancelled,
        AgentFailed,
        Resolved
    }

    // --- Structs ---

    struct Task {
        uint256 id;
        address client;
        address agent;
        address paymentToken;
        uint256 paymentAmount;
        uint256 agentStake;
        uint256 createdAt;
        uint256 deadline;
        uint256 cooldownEndsAt;
        TaskStatus status;
        bytes32 resultHash;
        bytes agentSignature;
        uint256 clientDisputeBond;
        uint256 agentEscalationBond;
        string clientEvidenceURI;
        string agentEvidenceURI;
        bytes32 umaAssertionId;
        bool umaResultTruth;
    }

    // --- Events ---

    event TaskCreated(uint256 indexed taskId, address indexed client, string descriptionURI);
    event TaskAccepted(uint256 indexed taskId, address indexed agent, uint256 stake);
    event PaymentDeposited(uint256 indexed taskId, address token, uint256 amount);
    event TaskResultAsserted(uint256 indexed taskId, bytes32 resultHash, address agent);
    event TaskDisputed(uint256 indexed taskId, address indexed client, uint256 bond, string evidenceURI);
    event TaskDisputeEscalated(uint256 indexed taskId, address indexed agent, uint256 bond, string evidenceURI, bytes32 assertionId);
    event TaskResolved(uint256 indexed taskId, TaskStatus status, bool agentWon);
    event TaskTimeoutCancelled(uint256 indexed taskId);
    event TaskAgentFailure(uint256 indexed taskId, string reason);

    // --- Functions ---

    function createTask(
        string calldata descriptionURI,
        address paymentToken,
        uint256 paymentAmount,
        uint256 deadline
    ) external returns (uint256 taskId);

    function acceptTask(uint256 taskId, uint256 stakeAmount) external;

    function depositPayment(uint256 taskId) external;

    function assertCompletion(
        uint256 taskId,
        bytes32 resultHash,
        bytes calldata agentSignature
    ) external;

    function disputeTask(
        uint256 taskId,
        string calldata clientEvidenceURI
    ) external payable;

    function escalateToUMA(
        uint256 taskId,
        string calldata agentEvidenceURI
    ) external payable;

    function timeoutCancellation(uint256 taskId, string calldata reason) external;

    function cannotComplete(uint256 taskId, string calldata reason) external;

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;

    function getTask(uint256 taskId) external view returns (Task memory);
}
```

### 1.2 UMA Optimistic Oracle V3 Interface

```solidity
interface IOptimisticOracleV3 {
    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32 identifier,
        uint256 domainId
    ) external returns (bytes32 assertionId);

    function disputeAssertion(bytes32 assertionId, address disputer) external;

    function settleAssertion(bytes32 assertionId) external;

    function getAssertion(bytes32 assertionId) external view returns (
        bool arbitrateViaEscalationManager,
        bool discardOracle,
        bool validateDisputers,
        address assertingCaller,
        address escalationManager
    );
}
```

---

## 2. JSON Schema Definitions

### 2.1 Task Creation Request

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TaskCreationRequest",
  "type": "object",
  "required": ["client", "paymentToken", "paymentAmount", "taskSpec"],
  "properties": {
    "client": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{40}$",
      "description": "Ethereum address of the client"
    },
    "paymentToken": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{40}$",
      "description": "ERC20 token address for payment"
    },
    "paymentAmount": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Payment amount in wei/token units"
    },
    "deadline": {
      "type": "integer",
      "minimum": 0,
      "description": "Unix timestamp deadline (0 for no deadline)"
    },
    "taskSpec": {
      "type": "object",
      "required": ["title", "description"],
      "properties": {
        "title": {
          "type": "string",
          "maxLength": 200
        },
        "description": {
          "type": "string",
          "maxLength": 10000
        },
        "inputs": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["type", "value"],
            "properties": {
              "type": {
                "type": "string",
                "enum": ["url", "text", "json", "file"]
              },
              "value": {
                "type": "string"
              }
            }
          }
        },
        "expectedOutput": {
          "type": "object",
          "properties": {
            "format": {
              "type": "string",
              "enum": ["text", "markdown", "json", "binary"]
            },
            "maxTokens": {
              "type": "integer"
            },
            "schema": {
              "type": "object"
            }
          }
        },
        "constraints": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

### 2.2 Task Metadata (Off-chain Storage)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TaskMetadata",
  "type": "object",
  "required": ["taskId", "version", "client", "createdAt", "spec", "payment"],
  "properties": {
    "taskId": { "type": "integer" },
    "version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    "client": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "createdAt": { "type": "integer" },
    "spec": { "type": "object" },
    "payment": {
      "type": "object",
      "required": ["token", "amount"],
      "properties": {
        "token": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
        "amount": { "type": "string", "pattern": "^[0-9]+$" }
      }
    },
    "deadline": { "type": "integer" },
    "agentSelection": {
      "type": "object",
      "properties": {
        "requiredCapabilities": { "type": "array", "items": { "type": "string" } },
        "minReputationScore": { "type": "integer", "minimum": 0, "maximum": 100 }
      }
    }
  }
}
```

### 2.3 Task Result Format

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TaskResult",
  "type": "object",
  "required": ["taskId", "resultURI", "resultHash", "agent", "agentSignature", "generatedAt"],
  "properties": {
    "taskId": { "type": "integer" },
    "resultURI": { "type": "string", "pattern": "^(ipfs://|https?://)" },
    "resultMimeType": { "type": "string" },
    "resultHash": { "type": "string", "pattern": "^0x[a-fA-F0-9]{64}$" },
    "agent": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "agentSignature": { "type": "string", "pattern": "^0x[a-fA-F0-9]+$" },
    "generatedAt": { "type": "integer" },
    "metadata": {
      "type": "object",
      "properties": {
        "model": { "type": "string" },
        "latencyMs": { "type": "integer" },
        "tokensOut": { "type": "integer" }
      }
    }
  }
}
```

### 2.4 Agent Capability Card

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentCapabilityCard",
  "type": "object",
  "required": ["agentId", "capabilityId", "name", "supportedDomains", "endpoints"],
  "properties": {
    "agentId": { "type": "string", "pattern": "^8004:[0-9]+:0x[a-fA-F0-9]{40}$" },
    "capabilityId": { "type": "string" },
    "name": { "type": "string" },
    "description": { "type": "string" },
    "supportedDomains": { "type": "array", "items": { "type": "string" } },
    "maxConcurrentTasks": { "type": "integer", "minimum": 1 },
    "sla": {
      "type": "object",
      "properties": {
        "minAcceptanceStake": { "type": "string", "pattern": "^[0-9]+$" },
        "avgCompletionTimeSeconds": { "type": "integer" },
        "maxCompletionTimeSeconds": { "type": "integer" }
      }
    },
    "endpoints": {
      "type": "object",
      "required": ["a2a"],
      "properties": {
        "a2a": { "type": "string", "format": "uri" },
        "status": { "type": "string", "format": "uri" },
        "telemetry": { "type": "string", "format": "uri" }
      }
    },
    "auth": {
      "type": "object",
      "properties": {
        "scheme": { "type": "string", "enum": ["bearer", "signature", "none"] },
        "publicKey": { "type": "string" }
      }
    }
  }
}
```

### 2.5 Agent-run auction market (price negotiation)

The auction is off-chain. Clients submit a task intent (no price); appropriate agents bid and may undercut each other (trust-weighted); each agent has a per-task **minAmount**. The market maker presents ranked **(agentId, trustScore, currentPrice)** to the client; the client selects one offer. Agreement is then executed on-chain via **createTask** and **acceptTask**.

**TaskIntent (client → market maker)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `auctionId` | string | yes | Unique auction id (e.g. UUID). |
| `taskSpec` or `descriptionURI` | object or string | one required | Task specification or URI. |
| `paymentToken` | string | yes | ERC20 token address. |
| `taskDeadline` | integer | yes | Unix timestamp task deadline. |
| `expiresAt` | integer | no | Auction expiry (e.g. 24–48h from now). |

No client price—auction discovers price.

**Join / Bid (agent → market maker)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `auctionId` | string | yes | Auction identifier. |
| `agentId` | string | yes | Agent identifier. |
| `ask` | string | yes | Current price (wei/token units). |
| `minAmount` | string | yes | Floor for this task; agent will not bid below. |
| `stakeAmount` | string | no | Proposed stake. |
| `taskDeadline` | integer | no | Agent-proposed deadline. |

Agents send initial bid when joining; send updates in subsequent rounds. Ask must be ≥ minAmount.

**Market state (market maker → agents, for undercutting)**

Per round or on update: e.g. best competing **trust-weighted** price or list of `{ price, trustScore }` so agents can compute next bid. Exact format is implementation-defined (anonymous or identified).

**Offers (market maker → client)**

List of `{ agentId, trustScore, currentPrice, stakeAmount?, taskDeadline?, minPrice? }` sorted by price ascending (or trust then price). Trust scores from the trust API (e.g. TrustApiMock). See [Lyneth Labs Whitepaper](https://docs.lyneth.ai/technical-docs/lyneth_labs_whitepaper); semantic search: [Agent0 search-service](https://github.com/agent0lab/search-service).

**Accept offer (client → market maker)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `auctionId` | string | yes | Auction identifier. |
| `agentId` | string | yes | Chosen agent. |
| `acceptedPrice` | string | yes | Must equal that agent's current bid. |

Market maker responds with **agreed terms**: `taskSpec` (or URI), `paymentToken`, `paymentAmount`, `deadline`, `stakeAmount` for client to call **createTask** and for agent to **acceptTask**. Agreement is recorded on-chain; no separate off-chain binding.

---

## 3. A2A Protocol Specification

See full spec for HTTP API endpoints: `POST /a2a/tasks`, `POST /a2a/tasks/:taskId/result`, `GET /a2a/tasks/:taskId/status`.

**Auction endpoints (agent-run auction market):** `POST /{agentId}/a2a/auction/join`, `POST /{agentId}/a2a/auction/:auctionId/bid`. Market maker exposes: create auction (TaskIntent), get offers, accept offer.

---

## 4. Cryptographic Specifications

- **Result Hash:** `keccak256(resultBytes)`
- **Agent Signature:** ECDSA of `keccak256(abi.encode(taskId, resultHash))` with EIP-191 prefix
- **UMA Claim:** Encoded as `abi.encode("AGENT_TASK_COMPLETION_V1", taskId, client, agent, resultHash, clientEvidenceURI, agentEvidenceURI)`

---

## 5. Constants and Configuration

- `COOLDOWN_PERIOD` = 24 hours
- `AGENT_RESPONSE_WINDOW` = 48 hours
- `DISPUTE_BOND_BPS` = 1000 (10%)
- `ESCALATION_BOND_BPS` = 1000 (10%)
- `UMA_LIVENESS` = 7200 (2 hours)

---

## 6. Error Codes

See full spec for smart contract errors and HTTP API error codes.
