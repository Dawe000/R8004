import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const FIRELIGHT_VAULT_COSTON2 = "0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B";
const FTESTXRP_COSTON2 = "0x0b6A3645c240605887a5532109323A3E12273dc7"; // Real FTestXRP (6 decimals)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying to Flare Coston2...");
  console.log("Deployer:", await deployer.getAddress());

  // 1. Use existing FTestXRP token (6 decimals, compatible with Firelight)
  const fxrpAddress = FTESTXRP_COSTON2;
  console.log("✓ Using FTestXRP:", fxrpAddress);

  // 2. Deploy MockOptimisticOracleV3
  const MockOOv3 = await ethers.getContractFactory("MockOptimisticOracleV3");
  const mockOOv3 = await MockOOv3.deploy();
  await mockOOv3.waitForDeployment();
  console.log("✓ MockOOv3:", await mockOOv3.getAddress());

  // 3. Deploy AgentTaskEscrow (no vault integration - agents manage vault separately)
  const AgentTaskEscrow = await ethers.getContractFactory("AgentTaskEscrow");
  const escrow = await AgentTaskEscrow.deploy(
    await deployer.getAddress(), // Market maker
    0, // No market maker fee for testing
    86400, // 24hr cooldown
    172800, // 48hr agent response window
    1000, // 10% dispute bond
    1000, // 10% escalation bond
    await mockOOv3.getAddress(),
    7200, // 2hr UMA liveness
    ethers.keccak256(ethers.toUtf8Bytes("AGENT_TASK_V1")),
    ethers.parseEther("10"), // 10 FXRP min UMA bond
    [fxrpAddress] // Allowed tokens: FTestXRP
  );
  await escrow.waitForDeployment();
  console.log("✓ AgentTaskEscrow:", await escrow.getAddress());

  // 4. Note: FTestXRP is already deployed - get from faucet at https://faucet.flare.network
  console.log("ℹ️  Get FTestXRP from faucet: https://faucet.flare.network");

  // 5. Save deployment config
  const deployment = {
    chainId: 114,
    network: "coston2-testnet",
    timestamp: new Date().toISOString(),
    contracts: {
      FXRP: fxrpAddress,
      FirelightVault: FIRELIGHT_VAULT_COSTON2,
      AgentTaskEscrow: await escrow.getAddress(),
      MockOOv3: await mockOOv3.getAddress(),
    },
    sdk: {
      escrowAddress: await escrow.getAddress(),
      fxrpTokenAddress: fxrpAddress,
      fFXRPVaultAddress: FIRELIGHT_VAULT_COSTON2,
      rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
      chainId: 114,
      deploymentBlock: (await ethers.provider.getBlock("latest"))!.number,
    },
  };

  const deployDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir);

  fs.writeFileSync(
    path.join(deployDir, "coston2-firelight.json"),
    JSON.stringify(deployment, null, 2)
  );

  console.log("\n✅ Deployment complete!");
  console.log("Config saved to: deployments/coston2-firelight.json");
}

main().catch(console.error);
