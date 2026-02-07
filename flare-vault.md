# Firelight Vault Integration - R8004 on Flare Coston2

## Overview

Integration of Firelight Vault's yield-bearing fFXRP tokens as agent collateral for the R8004 ERC8001 Agent Task System on Flare Coston2 testnet.

**Key Innovation**: Agents independently manage yield-bearing vault deposits, staking fFXRP shares (not FXRP) as collateral for tasks. This allows continuous yield accumulation even while collateral is locked in escrow.

## Architecture

### Core Principle
**Separation of Concerns**: Vault management is completely independent from the escrow system. Agents choose when to deposit/withdraw from the vault - the escrow simply accepts fFXRP as a valid ERC20 collateral token.

### Token Flow
- **FXRP**: Base asset (FAsset representing XRP on Flare)
- **fFXRP**: ERC-4626 vault shares (yield-bearing, 1:1+ ratio with FXRP)
- **Payment Token**: Client pays FXRP
- **Stake Token**: Agent stakes fFXRP

## System Flowchart

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT PREPARATION                            │
│                     (Before Any Tasks)                               │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Agent has FXRP tokens  │
                    └─────────────────────────┘
                                 │
                                 │ depositToVault()
                                 ▼
                    ┌─────────────────────────┐
                    │  Firelight Vault        │
                    │  0x91Bf...0B (Coston2)  │
                    └─────────────────────────┘
                                 │
                                 │ Mints fFXRP shares
                                 ▼
                    ┌─────────────────────────┐
                    │  Agent holds fFXRP      │
                    │  (Earning Yield 24/7)   │
                    └─────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         TASK LIFECYCLE                               │
└─────────────────────────────────────────────────────────────────────┘

    [Client]                [Agent]              [AgentTaskEscrow]
       │                       │                        │
       │ createTask(FXRP)     │                        │
       ├──────────────────────┼───────────────────────>│
       │                       │                        │
       │                       │ acceptTask(fFXRP)      │
       │                       ├───────────────────────>│
       │                       │                        │
       │ depositPayment(FXRP) │                        │
       ├──────────────────────┼───────────────────────>│
       │                       │                        │
       │                       │  [Task Execution]      │
       │                       │  fFXRP earning yield!  │
       │                       │                        │
       │                       │ assertCompletion()     │
       │                       ├───────────────────────>│
       │                       │                        │
       │              [24hr Cooldown]                   │
       │                       │                        │
       │ settleNoContest()     │                        │
       ├──────────────────────┼───────────────────────>│
       │                       │                        │
       │                       │<───── fFXRP returned ──┤
       │                       │<───── FXRP payment ────┤
       │                       │                        │
       │                       ▼                        │
       │            ┌─────────────────────────┐         │
       │            │  Agent has fFXRP back   │         │
       │            │  (Still earning yield!) │         │
       │            └─────────────────────────┘         │
                                 │
                                 │ redeemFromVault() [Whenever agent wants]
                                 ▼
                    ┌─────────────────────────┐
                    │  Agent receives FXRP    │
                    │  + Accrued Yield        │
                    └─────────────────────────┘
```

## Smart Contract Architecture

### AgentTaskEscrow.sol
**No modifications needed** - escrow treats fFXRP as a standard ERC20 token for collateral.

- Accepts FXRP as `paymentToken` (from client)
- Accepts fFXRP as stake token (from agent via `acceptTask()`)
- No vault integration logic required

### Deployment
**Coston2 Testnet (Chain ID 114)**

Deployed contracts:
- MockERC20 (FXRP) - test token for payments
- MockOptimisticOracleV3 - UMA dispute resolution
- AgentTaskEscrow - unchanged from base implementation
- Firelight Vault - pre-existing at `0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B`

## SDK Integration

### Vault Helpers (`sdk/src/vault.ts`)

Independent vault management functions for agents:

```typescript
// Deposit FXRP → Receive fFXRP shares
depositToVault(vaultAddress, fxrpAddress, signer, fxrpAmount): Promise<bigint>

// Withdraw FXRP from vault (specify FXRP amount)
withdrawFromVault(vaultAddress, signer, fxrpAmount): Promise<bigint>

// Redeem fFXRP shares → Receive FXRP + yield
redeemFromVault(vaultAddress, signer, fFXRPShares): Promise<bigint>

// Get agent's fFXRP balance
getVaultShareBalance(vaultAddress, signer): Promise<bigint>

// Get current exchange rate (FXRP per fFXRP)
getVaultExchangeRate(vaultAddress, signer): Promise<bigint>

// Preview operations before execution
previewDeposit(vaultAddress, signer, fxrpAmount): Promise<bigint>
previewRedeem(vaultAddress, signer, fFXRPShares): Promise<bigint>
```

### Configuration

```typescript
import { getCoston2FirelightConfig, depositToVault } from '@sdk/index';

const config = getCoston2FirelightConfig({
  chainId: 114,
  fxrpTokenAddress: '0x...', // From deployment
  fFXRPVaultAddress: '0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B',
  escrowAddress: '0x...', // From deployment
});
```

## Agent Workflow

### 1. Initial Setup (One-time)
```typescript
// Agent deposits FXRP reserves into vault
const fFXRPShares = await depositToVault(
  config.fFXRPVaultAddress,
  config.fxrpTokenAddress,
  agentSigner,
  parseEther("1000") // 1000 FXRP
);
// Agent now has fFXRP shares earning yield continuously
```

### 2. Accept Task (Use fFXRP as collateral)
```typescript
// Agent stakes fFXRP shares (NOT FXRP) to accept task
const stakeAmount = parseEther("100"); // 100 fFXRP shares
await agentSDK.acceptTask(taskId, stakeAmount);
// fFXRP continues earning yield while locked in escrow!
```

### 3. Complete Task & Settlement
```typescript
// After task completes, agent receives fFXRP shares back
// fFXRP has been earning yield the entire time
await agentSDK.settleNoContest(taskId);
```

### 4. Withdraw Yield (Anytime)
```typescript
// Agent can redeem fFXRP → FXRP whenever they want
const fxrpReceived = await redeemFromVault(
  config.fFXRPVaultAddress,
  agentSigner,
  fFXRPShares
);
// fxrpReceived > original deposit due to accumulated yield
```

## Key Benefits

### For Agents
- **Continuous Yield**: fFXRP earns yield 24/7, even while staked in escrow
- **Capital Efficiency**: Same collateral earns yield across multiple tasks
- **Flexible Liquidity**: Withdraw from vault independently of task lifecycle
- **Composability**: fFXRP can be used across DeFi protocols

### For Protocol
- **No Escrow Complexity**: Vault logic completely separate from task system
- **Standard ERC20**: fFXRP treated as any other token by escrow
- **Security**: No new attack vectors in core escrow contract
- **Upgradeability**: Vault strategies can evolve without changing escrow

## Bounty Qualification

**Flare Hackathon Tracks:**

✅ **Main Track**: Uses FAssets (FXRP)
- Client payments in FXRP (FAsset)
- Agent collateral in fFXRP (yield-bearing FAsset derivative)

✅ **Bonus Track**: Cross-chain Innovation
- XRPL → Flare via FAssets (FXRP)
- Demonstrates novel use case for FAssets beyond simple transfers

## Technical Considerations

### Exchange Rate Dynamics
- fFXRP:FXRP ratio increases over time as yield accrues
- Non-rebasing: yield captured in exchange rate, not token balance
- Agent benefits: fFXRP staked at 1.0x, returned at 1.05x (example)

### Period-Based Withdrawals (Firelight)
When agent loses dispute and client receives fFXRP:
1. Escrow transfers fFXRP to client (instant ERC20 transfer)
2. Client manually calls `vault.withdraw()` to initiate unwrap
3. Client waits for period to end
4. Client claims FXRP from vault

**Escrow doesn't need to know about vault periods** - client manages their own fFXRP separately.

### Gas Optimization
- Agents batch vault deposits (not per-task)
- No vault operations during settlement (just fFXRP transfers)
- Typical flow: 1 deposit → many tasks → 1 withdrawal

## Deployment Guide

### 1. Deploy Contracts
```bash
cd contracts
npx hardhat run script/deploy-coston2-firelight.ts --network coston2
```

### 2. Update Frontend Config
Copy addresses from `contracts/deployments/coston2-firelight.json` to:
- `frontend/src/config/constants.ts`
- `sdk/src/config.ts` (COSTON2_FIRELIGHT_DEFAULTS)

### 3. Test Vault Integration
```typescript
// Mint test FXRP
await fxrpToken.mint(agentAddress, parseEther("10000"));

// Deposit to vault
await depositToVault(VAULT_ADDRESS, FXRP_ADDRESS, signer, parseEther("1000"));

// Check balance
const shares = await getVaultShareBalance(VAULT_ADDRESS, signer);
console.log("fFXRP shares:", formatEther(shares));
```

## Network Details

**Flare Coston2 Testnet**
- Chain ID: 114
- RPC: https://coston2-api.flare.network/ext/C/rpc
- Explorer: https://coston2-explorer.flare.network
- Native Token: C2FLR (test FLR)
- Firelight Vault: 0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B

## Related Files

### Smart Contracts
- `contracts/src/AgentTaskEscrow.sol` - No changes (accepts fFXRP as ERC20)
- `contracts/script/deploy-coston2-firelight.ts` - Deployment script

### SDK
- `sdk/src/vault.ts` - Vault helper functions
- `sdk/src/config.ts` - Coston2 configuration
- `sdk/src/index.ts` - Exported vault functions

### Frontend
- `frontend/src/config/wagmi.ts` - Coston2 network config
- `frontend/src/config/constants.ts` - Contract addresses
- `frontend/src/hooks/useAgentSDK.ts` - SDK initialization

## Critical Technical Details (From Firelight Docs)

### Period-Based Withdrawal System

**IMPORTANT**: Withdrawals and redemptions are NOT instant!

#### How It Works
1. **Request Creation**: Calling `withdraw()` or `redeem()` creates a request tied to current period
2. **Period Completion**: Request processes after period ends (e.g., weekly cycle)
3. **Manual Claim**: User must explicitly claim assets after period ends

#### Impact on Dispute Resolution
When client wins dispute and receives slashed fFXRP:
1. ✅ **Instant**: Escrow transfers fFXRP to client (standard ERC20 transfer)
2. ⏳ **Client's Responsibility**: Client calls `vault.redeem(shares, clientAddress, clientAddress)`
3. ⏳ **Wait**: Redemption request created for current period
4. ⏳ **Claim**: After period ends, client claims FXRP from vault

**Key Insight**: Escrow contract doesn't need vault integration because fFXRP is just an ERC20 token. Clients manage their own unwrapping timing.

### Function Comparison Table

| Function | Input | Output | Timing | Use Case |
|----------|-------|--------|--------|----------|
| `deposit(assets, receiver)` | FXRP amount | fFXRP shares (calculated) | ✅ Instant | Agent deposits FXRP |
| `mint(shares, receiver)` | fFXRP shares desired | FXRP needed (calculated) | ✅ Instant | Agent wants exact shares |
| `withdraw(assets, receiver, owner)` | FXRP amount | Burns shares (calculated) | ⏳ Delayed | Agent wants specific FXRP |
| `redeem(shares, receiver, owner)` | fFXRP shares | FXRP received (calculated) | ⏳ Delayed | Agent burns exact shares |

**Recommendation**:
- Agents use `deposit()` for staking prep (simpler - just specify FXRP amount)
- Agents use `redeem()` for withdrawals (they know their fFXRP balance from wallet)

### Exchange Rate & Yield

- **Non-rebasing**: fFXRP balance stays constant, value increases via exchange rate
- **Yield Accrual**: If you stake at 1.0 FXRP = 1.0 fFXRP, you might redeem at 1.0 fFXRP = 1.05 FXRP
- **During Task**: fFXRP in escrow continues earning yield (reflected in exchange rate)
- **Preview Functions**: Use `previewDeposit()` and `previewRedeem()` to calculate conversions

### Validation Checks (Critical!)

Always validate before operations to avoid reverts:

```typescript
// Before deposit
const maxDeposit = await vault.maxDeposit(agentAddress);
if (depositAmount > maxDeposit) {
  throw new Error(`Exceeds max deposit: ${maxDeposit}`);
}

// Before redeem
const maxRedeem = await vault.maxRedeem(agentAddress);
if (shareAmount > maxRedeem) {
  throw new Error(`Exceeds max redeem: ${maxRedeem}`);
}

// Preview without gas
const sharesReceived = await vault.previewDeposit(depositAmount);
const fxrpReceived = await vault.previewRedeem(shareAmount);
```

### Status Queries

Check vault and period state:
```typescript
// Period information
const currentPeriod = await vault.currentPeriod();
const periodEnd = await vault.nextPeriodEnd();

// User balances
const fFXRPBalance = await vault.balanceOf(agentAddress);
const fxrpValue = await vault.convertToAssets(fFXRPBalance);

// Pending withdrawals
const pendingAmount = await vault.getPendingWithdrawal(agentAddress, periodNumber);
```

### Important Limitations

- **Total Assets**: Excludes pending withdrawals (not reflected until claimed)
- **Period Timing**: Redemption timing depends on when period ends (could be days)
- **No Instant Exits**: For instant liquidity, agents must use secondary markets or keep FXRP reserves

## Future Enhancements

- Frontend UI for vault deposit/withdraw with period countdown
- Dashboard showing vault APY and agent earnings
- Pending withdrawal tracker with claim notifications
- Multi-vault support (different yield strategies)
- Auto-compounding integration
- Secondary market for instant fFXRP→FXRP swaps
