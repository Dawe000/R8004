# Flare Integration Scripts

Quick reference for running Flare-specific deployments and tests on Coston2 testnet.

## Prerequisites

```bash
cd contracts
npm install
```

## Scripts

### 1. Deploy Custom Vault

Deploy custom ERC-4626 vault for yield-bearing FXRP (yFXRP).

```bash
npx hardhat run script/flare/deploy-custom-vault.ts --network coston2
```

**Deployed Contract**: `0xe07484f61fc5C02464ceE533D7535D0b5a257f22`

### 2. Deploy Escrow with Two-Token Support

Deploy AgentTaskEscrow with FXRP + yFXRP whitelisted.

```bash
npx hardhat run script/flare/deploy-coston2-firelight.ts --network coston2
```

**Deployed Contracts**:
- Escrow: `0x3419513f9636760C29033Fed040E7E1278Fa7B2b`
- MockOOv3: `0x4986BcE3A5517FEB4373B07a1FFF0ed4e2C8B340`

### 3. Vault Operations (E2E Testing)

Comprehensive vault testing with multiple operations.

#### Check Status
```bash
cd contracts
OP=status npx hardhat run script/flare/vault-operations.ts --network coston2
```

#### Deposit FXRP → Get yFXRP
```bash
OP=deposit AMOUNT=10 npx hardhat run script/flare/vault-operations.ts --network coston2
```

#### Redeem yFXRP → Get FXRP + Yield
```bash
OP=redeem AMOUNT=5 npx hardhat run script/flare/vault-operations.ts --network coston2
```

#### Full E2E Flow (Deposit → Create Task → Accept → Settle)
```bash
OP=flow npx hardhat run script/flare/vault-operations.ts --network coston2
```

**Expected Output**:
```
✅ yFXRP balance: 8.0
✅ Task created (FXRP payment, yFXRP stake)
✅ Task accepted with yFXRP stake
💎 yFXRP remaining: 7.5
🔒 yFXRP staked in escrow: 0.5
```

## Network Configuration

**Flare Coston2 Testnet**
- Chain ID: `114`
- RPC: `https://coston2-api.flare.network/ext/C/rpc`
- Explorer: `https://coston2-explorer.flare.network`
- Faucet: `https://faucet.flare.network`

## Contract Addresses

```typescript
// FAsset (real Flare token)
FTESTXRP: "0x0b6A3645c240605887a5532109323A3E12273dc7"

// Custom Vault (yFXRP)
VAULT: "0xe07484f61fc5C02464ceE533D7535D0b5a257f22"

// Escrow (two-token support)
ESCROW: "0x3419513f9636760C29033Fed040E7E1278Fa7B2b"

// MockOOv3
MOCK_OOV3: "0x4986BcE3A5517FEB4373B07a1FFF0ed4e2C8B340"

// Firelight Vault (official, has deposit caps)
FIRELIGHT_VAULT: "0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B"
```

## Documentation

- **[FLARE_INTEGRATION.md](./FLARE_INTEGRATION.md)** - Complete integration guide, developer feedback, and bounty qualification
- **[flare-vault.md](./flare-vault.md)** - Technical deep-dive on vault architecture and period-based withdrawals

## Common Workflows

### Setup New Agent
1. Get FXRP from faucet: `https://faucet.flare.network`
2. Deposit to vault: `OP=deposit AMOUNT=100 npx hardhat run script/flare/vault-operations.ts --network coston2`
3. Check balance: `OP=status npx hardhat run script/flare/vault-operations.ts --network coston2`

### Test Complete Flow
```bash
cd contracts
OP=flow npx hardhat run script/flare/vault-operations.ts --network coston2
```

This runs:
1. Deposit 1 FXRP → get 1 yFXRP
2. Client creates task (pays 1 FXRP, requires yFXRP stake)
3. Agent accepts (stakes 0.5 yFXRP)
4. Agent asserts completion
5. Settlement after cooldown
6. Agent receives payment + stake back

## Troubleshooting

### Insufficient Allowance Error
Add 10% buffer to approvals:
```typescript
const approvalAmount = depositAmount * 110n / 100n;
```

### Deposit Limit Exceeded (Firelight)
Use custom vault instead:
```typescript
VAULT: "0xe07484f61fc5C02464ceE533D7535D0b5a257f22" // No caps
```

### Wrong Decimal Precision
Always detect decimals dynamically:
```typescript
const decimals = await fxrp.decimals(); // 6, not 18!
```
