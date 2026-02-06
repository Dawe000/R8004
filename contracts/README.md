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

See `docs/TECHNICAL_SPEC.md` for interface definitions.
