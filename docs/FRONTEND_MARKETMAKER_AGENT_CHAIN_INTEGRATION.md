# Frontend + Agent + Chain Integration (Direct IPFS Intent Execution)

## 1) Scope and constraints

This integration uses direct frontend-to-agent execution handoff while keeping marketmaker for matching only.

- No smart contract changes.
- Existing escrow methods unchanged:
  - `createTask`
  - `acceptTask`
  - `depositPayment`
  - `assertCompletion`

## 2) End-to-end flow

1. Frontend builds canonical task spec JSON (`erc8001-task/v1`).
2. Frontend pins task spec to IPFS via `POST /api/ipfs/task` (server route).
3. Frontend calls `createTask(descriptionURI, ...)` using the IPFS URI.
4. Frontend dispatches selected agent directly (`POST /{agentId}/tasks?forceAsync=true`) with ERC8001 metadata including `chainId`.
5. Agent accepts on-chain with stake.
6. Client deposits payment on-chain from frontend.
7. Frontend notifies agent directly (`POST /{agentId}/erc8001/payment-deposited`) with `onchainTaskId` + `chainId`.
8. Agent verifies `paymentDeposited(taskId)` and resolves task input from on-chain `descriptionURI` (IPFS fetch).
9. Agent executes, stores result in D1, then calls `assertCompletion(..., resultURI)`.
10. Frontend polls chain and fetches result from on-chain `resultURI`.
11. Example-agent settlement cron (`*/5 * * * *`) automatically calls `settleNoContest` after cooldown when eligible.
12. If a task is disputed, the same cron can automatically escalate:
    - reads stored asserted payload snapshot from D1 metadata
    - verifies `keccak256(payloadBytes)` equals on-chain `resultHash`
    - uploads raw payload bytes to IPFS
    - calls `escalateToUMA` using the IPFS URI as `agentEvidenceURI`

## 3) Component changes

### SDK

Files:

- `sdk/src/taskSpec.ts`
- `sdk/src/index.ts`
- `sdk/test/taskSpec.test.ts`

Additions:

- `OnchainTaskSpecV1`
- `parseOnchainTaskSpec(...)`
- `fetchTaskSpecFromOnchainUri(...)`
- `ONCHAIN_TASK_SPEC_V1` constant export

Behavior:

- Supports canonical JSON task spec parsing.
- Supports plain-text fallback for legacy content.
- Deterministic errors for invalid/malformed schema.

### Frontend

Files:

- `frontend/src/app/api/ipfs/task/route.ts`
- `frontend/src/lib/api/agents.ts`
- `frontend/src/app/page.tsx`
- `frontend/src/components/TaskActivity.tsx`
- `frontend/src/lib/api/marketMaker.ts`
- `frontend/src/config/constants.ts`

Additions:

- Server route `POST /api/ipfs/task` for secret-backed IPFS pinning.
- Direct agent execution API methods:
  - `dispatchErc8001TaskDirect(...)`
  - `notifyErc8001PaymentDepositedDirect(...)`
- Task-spec pin helper:
  - `createTaskSpecUri(...)`

Changes:

- Frontend no longer uses marketmaker dispatch/notify execution routes.
- Direct execution now supports both Plasma Testnet (`9746`) and Flare Coston2 (`114`).
- Home + Activity payment-notify flows call agent worker directly.
- Marketmaker client API now handles matching only.
- Task dispatch metadata is chain-scoped (`chainId:taskId`) to avoid cross-chain ID collisions.

### Exampleagents worker

Files:

- `exampleagents/example-agents-worker.js`
- `exampleagents/wrangler.toml`

Changes:

- ERC8001 runs can be created without request-body `input`.
- Queue execution resolves input from chain/IPFS:
  - reads `TaskCreated.descriptionURI`
  - fetches IPFS content
  - parses canonical task spec
- Execution now uses on-chain task content, not marketmaker-forwarded raw prompt.
- Response metadata now records:
  - `descriptionURI`
  - `specVersion`
  - `inputSource: "onchain-ipfs"`
  - `specError` on failure
- Assertion snapshot metadata now records:
  - `assertionPayloadB64`
  - `assertionPayloadHash`
  - `assertionCapturedAt`
- Dispute escalation metadata now records:
  - `erc8001.escalation.attempts`
  - `erc8001.escalation.lastAttemptAt`
  - `erc8001.escalation.lastErrorCode`
  - `erc8001.escalation.lastErrorMessage`
  - `erc8001.escalation.evidenceUri`
  - `erc8001.escalation.escalatedAt`
- Added optional env/config:
  - `ERC8001_CHAIN_IDS` (optional; defaults to both `9746,114`)
  - chain-scoped network overrides:
    - `ERC8001_RPC_URL_9746`, `ERC8001_ESCROW_ADDRESS_9746`, `ERC8001_DEPLOYMENT_BLOCK_9746`, `ERC8001_PUBLIC_BASE_URL_9746`
    - `ERC8001_RPC_URL_114`, `ERC8001_ESCROW_ADDRESS_114`, `ERC8001_DEPLOYMENT_BLOCK_114`, `ERC8001_PUBLIC_BASE_URL_114`
  - legacy unsuffixed fallback vars remain supported (`ERC8001_RPC_URL`, `ERC8001_ESCROW_ADDRESS`, `ERC8001_DEPLOYMENT_BLOCK`, `ERC8001_PUBLIC_BASE_URL`)
  - `PINATA_JWT` or `NFT_STORAGE_API_KEY` (for escalation evidence uploads)
  - `IPFS_PROVIDER=mock` (local testing)
  - `IPFS_URI_SCHEME`

### Marketmaker

Files:

- `marketmakeragent/src/api/agentMcpEndpoints.ts`
- `marketmakeragent/src/services/agentMcp.ts`
- `marketmakeragent/tests/worker.test.ts`

Changes:

- Removed execution middleman endpoints:
  - `POST /api/agents/:agentId/erc8001/dispatch`
  - `POST /api/agents/:agentId/erc8001/payment-deposited`
- Matching endpoints remain unchanged.

## 4) Canonical on-chain task spec

```json
{
  "version": "erc8001-task/v1",
  "input": "user prompt text",
  "skill": "optional-skill-id",
  "model": "optional-model-id",
  "client": "0x...",
  "createdAt": "ISO-8601"
}
```

Parsing rules:

1. Valid `erc8001-task/v1` JSON with non-empty `input` is canonical.
2. Plain text content is accepted as legacy fallback.
3. Invalid JSON schema fails deterministically.

## 5) Frontend server env for IPFS route

`POST /api/ipfs/task` requires one of:

- `PINATA_JWT`
- `NFT_STORAGE_API_KEY`
- `IPFS_PROVIDER=mock` (local-only fallback)

Optional:

- `IPFS_URI_SCHEME=https` (defaults to `ipfs`)

## 6) Non-goals / unchanged

- No contract ABI or contract logic changes.
- No change to contestation mechanics.
- Marketmaker semantic matching remains in place.

## 7) Frontend contestation UX (current)

Contestation controls are exposed in both:

- Home active task panel
- Activity task details dialog

Behavior:

- `Dispute Result` is available only when:
  - connected wallet is the task client
  - task status is `ResultAsserted`
  - cooldown/dispute window is still open
  - evidence URI is valid (`ipfs://`, `https://`, `http://`, `ar://`)
- `Settle Agent Conceded` is available only when:
  - connected wallet is the task client
  - task status is `DisputedAwaitingAgent`
  - `cooldownEndsAt + agentResponseWindow` has passed

Notes:

- Evidence mode is URI-only in frontend (no file upload flow in this pass).
- On-chain task state remains source of truth.
- UI eligibility is advisory; transaction success/failure is final authority.
- Activity task cards fetch once on mount and only poll while the details dialog is open.
- Polling uses adaptive backoff on RPC rate limits (up to 60s) to reduce write-failure pressure.
- Dispute error handling classifies RPC failures (rate-limited, reverted, insufficient funds, user rejected) and surfaces deterministic toasts.
- Escalation remains cron-driven by the agent worker; frontend does not submit `escalateToUMA` directly.
- Frontend eligibility is normalized through `frontend/src/lib/contestation.ts` helpers:
  - `getDisputeEligibility(...)`
  - `getSettleEligibility(...)`
