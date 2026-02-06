# Vision for Intent-Based Tasks

## ERC8001 Agent Task System

We create an ERC8001 intents-based system for agent tasks, with a market maker to accompany it, and UMA to secure it.

**References:**

- https://eips.ethereum.org/EIPS/eip-8001
- https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work

---

## PREREQUISITES

- Trust system (ERC8004 with semantic search)
- Search system (operational)

---

## Roles

- **Client:** Anyone in need of agent services (can be an agent, human, or any entity)
- **Agent:** Agent that fulfills a service

---

## Flow (with edge cases)

### 1. Task Creation

Client creates a natural language request in our smart contract.

### 2. Agent Discovery & Selection

Market maker (us) routes this to an agent using ERC8004-backed semantic search over registered agents and their declared actions/capabilities.

### 3. Task Acceptance

Agent accepts and puts up stake.

### 4. Payment Escrow

User pays (x402 or other), and the smart contract logic includes a flat fee that is taken by the market maker on settlement.

### 5. Task Coordination

Client communicates `taskId` to agent (for tracking and proof of participation).

### 6. Task Execution

Agent completes task off-chain.

### 7. Result Submission & Assertion

**CRITICAL FLOW:** Agent creates onchain commitment, then delivers result directly to client.

1. Agent generates result
2. Agent creates hash of result: `resultHash = keccak256(result)`
3. Agent signs commitment: `signature = sign(taskId, resultHash)`
4. Agent asserts completion **on our contract** with `(taskId, resultHash, signature)` → **onchain commitment created**
5. Agent then sends result **directly to client** (off-chain)
6. If client disputes, evidence uploaded to IPFS/HTTP at that point
7. Onchain commitment proves agent completed work at specific time

**Key principle:** Evidence only uploaded when disputes happen. Normal flow is direct communication.

### 8. Settlement Paths

- **Path A (Happy Path):** Cooldown expires, no dispute → agent gets payment + stake, MM gets fee, no UMA.
- **Path B (Dispute):** Client disputes → local resolution or UMA escalation.
- **Path C (Timeout):** Deadline exceeded → client cancels, gets refund, agent stake slashed.
- **Path D (Agent Failure):** Agent signals cannot complete → clean cancellation, no MM fee.

---

## Market Maker

- Takes natural language query
- Uses **ERC8004 semantic search** over agent registry
- Evaluates trust
- Returns ranked candidate agents (Jumper-style UI)
- User accepts → creates tx, we execute
- Options for stake securing

---

## Communication Pattern Summary

**Normal flow (no dispute):** Agent asserts onchain → sends result directly to client → cooldown → settlement. No IPFS, no UMA.

**Dispute (agent concedes):** Client uploads evidence → disputes → agent does nothing → client wins locally. No UMA.

**Dispute (agent fights):** Client disputes → agent escalates with evidence → UMA DVM votes → contract redistributes funds.

---

## Notes

- Payment escrow: consider optional modes for tasks where agent needs the asset (e.g. yield farming).
- Focus on non-yield use cases; we aren't bond.credit.
