import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { TESTNET_CONFIG } from "../../config";

/**
 * Deploy only AgentTaskEscrow + MockOOv3 (UMA) on Coston2.
 * Does NOT deploy any vault or token – reuses existing FXRP and yFXRP vault addresses.
 */

const FIRELIGHT_VAULT_COSTON2 = "0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B";
const FTESTXRP_COSTON2 = "0x0b6A3645c240605887a5532109323A3E12273dc7"; // Existing FTestXRP (6 decimals)
const CUSTOM_VAULT_COSTON2 = "0xe07484f61fc5C02464ceE533D7535D0b5a257f22"; // Existing custom yFXRP vault

async function main() {
  const [deployer, _client, _agent, marketMaker] = await ethers.getSigners();
  console.log("Deploying to Flare Coston2 (escrow + MockOOv3 only, no vault)...");
  console.log("  Deployer:", await deployer.getAddress());
  console.log("  MarketMaker:", await marketMaker.getAddress());

  const fxrpAddress = FTESTXRP_COSTON2;
  console.log("  Reusing existing FXRP:", fxrpAddress);
  console.log("  Reusing existing yFXRP vault:", CUSTOM_VAULT_COSTON2);

  // 1. Deploy MockOptimisticOracleV3
  const MockOOv3 = await ethers.getContractFactory("MockOptimisticOracleV3");
  const mockOOv3 = await MockOOv3.deploy();
  await mockOOv3.waitForDeployment();
  console.log("✓ MockOOv3:", await mockOOv3.getAddress());

  // 2. Deploy AgentTaskEscrow – same timing/bond params as Plasma (TESTNET_CONFIG)
  const AgentTaskEscrow = await ethers.getContractFactory("AgentTaskEscrow");
  const escrow = await AgentTaskEscrow.deploy(
    await marketMaker.getAddress(),
    0,
    TESTNET_CONFIG.COOLDOWN_PERIOD,
    TESTNET_CONFIG.AGENT_RESPONSE_WINDOW,
    TESTNET_CONFIG.DISPUTE_BOND_BPS,
    TESTNET_CONFIG.ESCALATION_BOND_BPS,
    await mockOOv3.getAddress(),
    TESTNET_CONFIG.UMA_LIVENESS,
    ethers.keccak256(ethers.toUtf8Bytes("AGENT_TASK_V1")),
    TESTNET_CONFIG.UMA_MINIMUM_BOND,
    [fxrpAddress, CUSTOM_VAULT_COSTON2] // Allowed tokens: FXRP and yFXRP (only difference vs Plasma)
  );
  await escrow.waitForDeployment();
  console.log("✓ AgentTaskEscrow:", await escrow.getAddress());
  console.log("  Whitelisted FXRP:", fxrpAddress);
  console.log("  Whitelisted yFXRP:", CUSTOM_VAULT_COSTON2);

  console.log("ℹ️  FTestXRP from faucet: https://faucet.flare.network");

  // 3. Save deployment config
  const deployment = {
    chainId: 114,
    network: "coston2-testnet",
    timestamp: new Date().toISOString(),
    contracts: {
      FXRP: fxrpAddress,
      yFXRP: CUSTOM_VAULT_COSTON2,
      FirelightVault: FIRELIGHT_VAULT_COSTON2,
      AgentTaskEscrow: await escrow.getAddress(),
      MockOOv3: await mockOOv3.getAddress(),
    },
    sdk: {
      escrowAddress: await escrow.getAddress(),
      fxrpTokenAddress: fxrpAddress,
      yFXRPTokenAddress: CUSTOM_VAULT_COSTON2,
      firelightVaultAddress: FIRELIGHT_VAULT_COSTON2,
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
