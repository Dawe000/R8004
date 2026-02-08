# Vision for Intent-Based Tasks

## ERC8001 Agent Task System

We create an ERC8001 intents-based system for agent tasks, with a market maker to accompany it, and UMA to secure it.

**References:**

- https://eips.ethereum.org/EIPS/eip-8001
- [UMA Oracle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work) · [UMA DVM 2.0](https://docs.uma.xyz/protocol-overview/dvm-2.0)

---

## PREREQUISITES

- Trust system (ERC8004 with semantic search) — [Lyneth Labs Whitepaper](https://docs.lyneth.ai/technical-docs/lyneth_labs_whitepaper)
- Search system (operational) — [Agent0 Semantic Search Service](https://github.com/agent0lab/search-service)

---

## Roles

- **Client:** Anyone in need of agent services (can be an agent, human, or any entity)
- **Agent:** Agent that fulfills a service

---

## Flow (with edge cases)

### 1. Task Creation

Client creates a natural language request in our smart contract.

### 2. Agent Discovery & Selection

Market maker (us) routes this to an agent using [ERC8004-backed semantic search](https://github.com/agent0lab/search-service) over registered agents and their declared actions/capabilities.

### 3. Task Acceptance

Agent accepts via `acceptTask(taskId, stakeAmount)` and stakes collateral in the contract.

### 4. Payment Escrow

Client deposits payment via `depositPayment(taskId)` after the task is Accepted. A market-maker fee (basis points) is taken on successful settlement.

### 5. Task Coordination

Client communicates `taskId` to agent (for tracking and proof of participation).

### 6. Task Execution

Agent completes task off-chain.

### 7. Result Submission & Assertion

**CRITICAL FLOW:** Agent creates onchain commitment, then delivers result directly to client.

1. Agent generates result and hashes it: `resultHash = keccak256(result)`
2. Agent signs: `signature = sign(taskId, resultHash)` (EIP-191)
3. Agent calls **assertCompletion(taskId, resultHash, signature, resultURI)** on the contract (optional `resultURI`); cooldown starts
4. Agent sends result directly to client (off-chain)
5. If client disputes during cooldown, they call `disputeTask(taskId, evidenceURI)` with dispute bond; evidence uploaded to IPFS/HTTP
6. Onchain commitment proves agent completed work at a specific time

**Key principle:** Evidence only uploaded when disputes happen. Normal flow is direct communication.

### 8. Settlement Paths

- **Path A (Happy Path):** After cooldown expires with no dispute, **agent** calls `settleNoContest(taskId)` → agent gets payment (minus MM fee) + stake, MM gets fee. No UMA.
- **Path B (Dispute):** Client disputes during cooldown (with bond). If agent does nothing, **client** calls `settleAgentConceded(taskId)` after agent response window → client gets payment + bond + agent stake. If agent escalates with `escalateToUMA`, UMA DVM resolves; contract settles via `assertionResolvedCallback`.
- **Path C (Timeout):** When **deadline** has passed and task is still Created or Accepted, **client** calls `timeoutCancellation(taskId, reason)` → client gets payment (if deposited) and agent’s stake; no MM fee.
- **Path D (Agent Failure):** Agent calls `cannotComplete(taskId, reason)` → clean cancellation (payment and stake returned), no MM fee.

---

## Market Maker

- Takes natural language query
- Uses [ERC8004 semantic search](https://github.com/agent0lab/search-service) over agent registry
- Evaluates trust ([Lyneth whitepaper](https://docs.lyneth.ai/technical-docs/lyneth_labs_whitepaper))
- Returns ranked candidate agents (Jumper-style UI)
- User accepts → creates tx, we execute
- Options for stake securing

---

## Communication Pattern Summary

**Normal flow (no dispute):** Agent calls assertCompletion → sends result directly to client → after cooldown, agent calls settleNoContest → receives payment + stake. No IPFS, no UMA.

**Dispute (agent concedes):** Client calls disputeTask (with bond) during cooldown → agent does nothing → after agent response window, client calls settleAgentConceded → client receives payment + bond + agent stake. No UMA.

**Dispute (agent fights):** Client disputes → agent calls escalateToUMA (with bond) within agent response window → UMA DVM votes → oracle calls assertionResolvedCallback on contract → contract redistributes funds.

---

## Notes

- Payment escrow: consider optional modes for tasks where agent needs the asset (e.g. yield farming).
- Focus on non-yield use cases; we aren't bond.credit.
