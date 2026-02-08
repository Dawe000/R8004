import { ethers } from "hardhat";

/**
 * Comprehensive Vault Operations Script
 *
 * Usage:
 *   npx hardhat run script/vault-operations.ts --network coston2
 *
 * Functions available:
 *   - status: Check vault and balance status
 *   - deposit: Deposit FXRP → get yFXRP
 *   - redeem: Redeem yFXRP → get FXRP back
 *   - fullFlow: Complete agent workflow (deposit + task + stake)
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  VAULT: "0xe07484f61fc5C02464ceE533D7535D0b5a257f22",
  FTESTXRP: "0x0b6A3645c240605887a5532109323A3E12273dc7",
  ESCROW: "0x5CA6175c0a5ec4ce61416E49fe69e3B91B4Ba310",
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

const VAULT_ABI = [
  "function asset() external view returns (address)",
  "function deposit(uint256 assets, address receiver) external returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) external returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function convertToShares(uint256 assets) external view returns (uint256)",
  "function previewDeposit(uint256 assets) external view returns (uint256)",
  "function previewRedeem(uint256 shares) external view returns (uint256)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function maxDeposit(address owner) external view returns (uint256)",
  "function maxRedeem(address owner) external view returns (uint256)",
];

const ESCROW_ABI = [
  "function createTask(string memory descriptionURI, address paymentToken, uint256 paymentAmount, uint256 deadline, address stakeToken) external returns (uint256)",
  "function acceptTask(uint256 taskId, uint256 stakeAmount) external",
  "function tasks(uint256) external view returns (address client, address agent, address paymentToken, uint256 paymentAmount, uint256 agentStake, uint256 deadline, uint8 status, uint256 cooldownEnd, bytes32 resultHash, uint256 clientDisputeBond, uint256 agentEscalationBond, address stakeToken)",
];

// ============================================================================
// Helper Functions
// ============================================================================

async function getContracts(signer: any) {
  const fxrp = new ethers.Contract(CONFIG.FTESTXRP, ERC20_ABI, signer);
  const vault = new ethers.Contract(CONFIG.VAULT, VAULT_ABI, signer);
  const escrow = new ethers.Contract(CONFIG.ESCROW, ESCROW_ABI, signer);
  const decimals = await fxrp.decimals();

  return { fxrp, vault, escrow, decimals };
}

// ============================================================================
// Operation: Status
// ============================================================================

async function checkStatus() {
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const { fxrp, vault, decimals } = await getContracts(signer);

  console.log("=== Vault Status ===");
  console.log("User:", signerAddress);
  console.log("Vault:", CONFIG.VAULT);

  const fxrpName = await fxrp.name();
  const fxrpSymbol = await fxrp.symbol();
  console.log(`\n📦 Asset: ${fxrpName} (${fxrpSymbol})`);
  console.log(`🔢 Decimals: ${decimals}`);

  // Vault global stats
  console.log("\n=== Vault Global Stats ===");
  const totalAssets = await vault.totalAssets();
  const totalSupply = await vault.totalSupply();
  console.log(`💰 Total Assets: ${ethers.formatUnits(totalAssets, decimals)} FXRP`);
  console.log(`📊 Total Supply: ${ethers.formatUnits(totalSupply, decimals)} yFXRP`);

  // Exchange rate
  const oneShare = ethers.parseUnits("1", decimals);
  const fxrpPerShare = await vault.convertToAssets(oneShare);
  const sharePerFXRP = await vault.convertToShares(oneShare);
  console.log(`\n💱 Exchange Rate:`);
  console.log(`   1 yFXRP = ${ethers.formatUnits(fxrpPerShare, decimals)} FXRP`);
  console.log(`   1 FXRP = ${ethers.formatUnits(sharePerFXRP, decimals)} yFXRP`);

  // User balances
  console.log("\n=== Your Balances ===");
  const fxrpBalance = await fxrp.balanceOf(signerAddress);
  const yFXRPBalance = await vault.balanceOf(signerAddress);

  console.log(`💵 FXRP: ${ethers.formatUnits(fxrpBalance, decimals)}`);
  console.log(`🎯 yFXRP: ${ethers.formatUnits(yFXRPBalance, decimals)}`);

  if (yFXRPBalance > 0n) {
    const yFXRPValue = await vault.convertToAssets(yFXRPBalance);
    console.log(`💎 yFXRP value: ${ethers.formatUnits(yFXRPValue, decimals)} FXRP`);

    const yield_ = yFXRPValue - yFXRPBalance;
    if (yield_ > 0n) {
      console.log(`✨ Accrued yield: ${ethers.formatUnits(yield_, decimals)} FXRP`);
    }
  }

  // Max operations
  console.log("\n=== Max Operations ===");
  const maxDeposit = await vault.maxDeposit(signerAddress);
  const maxRedeem = await vault.maxRedeem(signerAddress);

  console.log(`📥 Max deposit: ${maxDeposit === ethers.MaxUint256 ? "Unlimited" : ethers.formatUnits(maxDeposit, decimals) + " FXRP"}`);
  console.log(`📤 Max redeem: ${ethers.formatUnits(maxRedeem, decimals)} yFXRP`);
}

// ============================================================================
// Operation: Deposit
// ============================================================================

async function deposit(amount?: string) {
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const { fxrp, vault, decimals } = await getContracts(signer);

  const fxrpBalance = await fxrp.balanceOf(signerAddress);
  const depositAmount = amount
    ? ethers.parseUnits(amount, decimals)
    : ethers.parseUnits("0.001", decimals);

  console.log("=== Deposit to Vault ===");
  console.log(`Depositing: ${ethers.formatUnits(depositAmount, decimals)} FXRP`);

  if (fxrpBalance < depositAmount) {
    console.log(`\n⚠️  Insufficient FXRP! Have ${ethers.formatUnits(fxrpBalance, decimals)}, need ${ethers.formatUnits(depositAmount, decimals)}`);
    console.log("Get FTestXRP from: https://faucet.flare.network");
    return;
  }

  // Preview
  const expectedShares = await vault.previewDeposit(depositAmount);
  console.log(`Expected yFXRP: ${ethers.formatUnits(expectedShares, decimals)}`);

  // Approve
  const approveTx = await fxrp.approve(CONFIG.VAULT, depositAmount);
  await approveTx.wait();
  console.log("✅ Approved");

  // Deposit
  const depositTx = await vault.deposit(depositAmount, signerAddress);
  const receipt = await depositTx.wait();
  console.log("✅ Deposited!");
  console.log(`TX: ${receipt!.hash}`);

  // Check new balances
  const yFXRPBalance = await vault.balanceOf(signerAddress);
  const totalAssets = await vault.totalAssets();
  console.log(`\n🎉 New yFXRP balance: ${ethers.formatUnits(yFXRPBalance, decimals)}`);
  console.log(`📦 Vault total assets: ${ethers.formatUnits(totalAssets, decimals)} FXRP`);
}

// ============================================================================
// Operation: Redeem
// ============================================================================

async function redeem(amount?: string) {
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const { fxrp, vault, decimals } = await getContracts(signer);

  const yFXRPBalance = await vault.balanceOf(signerAddress);

  console.log("=== Redeem from Vault ===");
  console.log(`yFXRP balance: ${ethers.formatUnits(yFXRPBalance, decimals)}`);

  if (yFXRPBalance === 0n) {
    console.log("⚠️  No yFXRP to redeem!");
    return;
  }

  // Default to half if no amount specified
  const redeemAmount = amount
    ? ethers.parseUnits(amount, decimals)
    : yFXRPBalance / 2n;

  console.log(`\nRedeeming: ${ethers.formatUnits(redeemAmount, decimals)} yFXRP`);

  // Preview
  const expectedFXRP = await vault.previewRedeem(redeemAmount);
  console.log(`Expected FXRP: ${ethers.formatUnits(expectedFXRP, decimals)}`);

  // Check balances before
  const fxrpBefore = await fxrp.balanceOf(signerAddress);

  // Redeem (instant - no period delays in custom vault)
  const redeemTx = await vault.redeem(redeemAmount, signerAddress, signerAddress);
  const receipt = await redeemTx.wait();
  console.log("✅ Redeemed!");
  console.log(`TX: ${receipt!.hash}`);

  // Check balances after
  const fxrpAfter = await fxrp.balanceOf(signerAddress);
  const yFXRPAfter = await vault.balanceOf(signerAddress);

  const fxrpReceived = fxrpAfter - fxrpBefore;
  console.log(`\n✨ FXRP received: ${ethers.formatUnits(fxrpReceived, decimals)}`);
  console.log(`💎 Remaining yFXRP: ${ethers.formatUnits(yFXRPAfter, decimals)}`);

  if (yFXRPAfter > 0n) {
    const remainingValue = await vault.convertToAssets(yFXRPAfter);
    console.log(`💰 Remaining value: ${ethers.formatUnits(remainingValue, decimals)} FXRP`);
  }
}

// ============================================================================
// Operation: Full Agent Flow
// ============================================================================

async function fullFlow() {
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const { fxrp, vault, escrow, decimals } = await getContracts(signer);

  console.log("=== Full Agent Workflow ===");
  console.log("User:", signerAddress);

  // Tiny amounts (6 decimals) – safe with ~3 FXRP per wallet
  const depositAmount = ethers.parseUnits("0.001", decimals);
  const paymentAmount = ethers.parseUnits("0.001", decimals);
  const stakeAmount = ethers.parseUnits("0.0001", decimals);

  // Step 1: Deposit to vault
  console.log("\n📝 Step 1: Deposit FXRP → get yFXRP");
  console.log(`   Amount: ${ethers.formatUnits(depositAmount, decimals)} FXRP`);

  const approveTx1 = await fxrp.approve(CONFIG.VAULT, depositAmount);
  await approveTx1.wait();

  const depositTx = await vault.deposit(depositAmount, signerAddress);
  await depositTx.wait();

  const yFXRPBalance = await vault.balanceOf(signerAddress);
  console.log(`✅ yFXRP balance: ${ethers.formatUnits(yFXRPBalance, decimals)}`);

  // Step 2: Create task (as client)
  console.log("\n📝 Step 2: Create task (paying with FXRP, staking yFXRP)");
  console.log(`   Payment: ${ethers.formatUnits(paymentAmount, decimals)} FXRP`);
  const deadline = Math.floor(Date.now() / 1000) + 86400;

  const approveTx2 = await fxrp.approve(CONFIG.ESCROW, paymentAmount);
  await approveTx2.wait();

  const createTx = await escrow.createTask(
    "ipfs://test-task",
    CONFIG.FTESTXRP,     // paymentToken (FXRP)
    paymentAmount,
    deadline,
    CONFIG.VAULT         // stakeToken (yFXRP)
  );
  const receipt = await createTx.wait();

  // Parse TaskCreated event to get taskId
  const taskCreatedEvent = receipt!.logs.find(
    (log: any) => log.topics[0] === ethers.id("TaskCreated(uint256,address,address,uint256,uint256,address)")
  );
  const taskId = taskCreatedEvent ? ethers.toBigInt(taskCreatedEvent.topics[1]) : 0n;
  console.log(`✅ Task created (ID: ${taskId})`);

  // Step 3: Accept task (stake yFXRP, which keeps earning yield)
  console.log("\n📝 Step 3: Accept task (stake yFXRP)");
  console.log(`   Stake: ${ethers.formatUnits(stakeAmount, decimals)} yFXRP`);
  console.log("   ⚠️  Note: Can't accept own task - agent must be different address");
  console.log("   In production, a different agent would:");
  console.log("     1. Approve yFXRP to escrow");
  console.log("     2. Call acceptTask(taskId, stakeAmount)");
  console.log("     3. yFXRP stake earns 5-10% APY while locked");

  const yFXRP = new ethers.Contract(CONFIG.VAULT, ERC20_ABI, signer);
  const approveTx3 = await yFXRP.approve(CONFIG.ESCROW, stakeAmount);
  await approveTx3.wait();
  console.log("✅ yFXRP approved for escrow (ready for agent acceptance)");

  // Summary
  console.log("\n=== Summary ===");
  const finalYFXRP = await vault.balanceOf(signerAddress);
  const finalValue = await vault.convertToAssets(finalYFXRP);
  console.log(`💎 yFXRP remaining: ${ethers.formatUnits(finalYFXRP, decimals)}`);
  console.log(`💰 Remaining value: ${ethers.formatUnits(finalValue, decimals)} FXRP`);
  console.log(`🔒 yFXRP staked in escrow: ${ethers.formatUnits(stakeAmount, decimals)}`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const operation = process.env.OP || "status";

  console.log(`\n🚀 Running operation: ${operation}\n`);

  switch (operation.toLowerCase()) {
    case "status":
      await checkStatus();
      break;
    case "deposit":
      await deposit(process.env.AMOUNT);
      break;
    case "redeem":
      await redeem(process.env.AMOUNT);
      break;
    case "flow":
      await fullFlow();
      break;
    default:
      console.log("❌ Unknown operation:", operation);
      console.log("\nAvailable operations:");
      console.log("  OP=status   - Check vault status and balances");
      console.log("  OP=deposit  - Deposit FXRP to vault (AMOUNT=0.001 default)");
      console.log("  OP=redeem   - Redeem yFXRP from vault (AMOUNT=half)");
      console.log("  OP=flow     - Full agent workflow");
      console.log("\nExample:");
      console.log("  OP=deposit AMOUNT=5 npx hardhat run script/vault-operations.ts --network coston2");
  }
}

main().catch(console.error);
