import { ethers } from "hardhat";

/**
 * Deploy custom ERC-4626 vault for FXRP (no deposit limits)
 *
 * Run: npx hardhat run script/deploy-custom-vault.ts --network coston2
 */

const FTESTXRP_COSTON2 = "0x0b6A3645c240605887a5532109323A3E12273dc7";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=== Deploying Custom ERC-4626 Vault ===");
  console.log("Deployer:", await deployer.getAddress());
  console.log("Asset (FTestXRP):", FTESTXRP_COSTON2);

  // Deploy MockERC4626Vault
  const MockERC4626Vault = await ethers.getContractFactory("MockERC4626Vault");
  const vault = await MockERC4626Vault.deploy(
    FTESTXRP_COSTON2,
    "Yield FXRP",
    "yFXRP"
  );
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log("\n✅ Vault deployed:", vaultAddress);

  // Verify configuration
  const asset = await vault.asset();
  const name = await vault.name();
  const symbol = await vault.symbol();
  const decimals = await vault.decimals();

  console.log("\n=== Vault Info ===");
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Asset:", asset);
  console.log("Max deposit:", await vault.maxDeposit(deployer.address));

  console.log("\n✅ Deployment complete!");
  console.log("\nUpdate constants with:");
  console.log(`  firelightVaultAddress: '${vaultAddress}'`);
}

main().catch(console.error);
