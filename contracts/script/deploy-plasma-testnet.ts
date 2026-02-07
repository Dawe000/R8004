import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { TESTNET_CONFIG } from "../config";

async function main() {
  const [deployer, client, agent, marketMaker] = await ethers.getSigners();

  console.log("Deploying to Plasma testnet...");
  console.log("  Deployer:", await deployer.getAddress());
  console.log("  Client:", await client.getAddress());
  console.log("  Agent:", await agent.getAddress());
  console.log("  MarketMaker:", await marketMaker.getAddress());
  console.log("");

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test Token", "TST", 18);
  await mockToken.waitForDeployment();

  const MockOOv3 = await ethers.getContractFactory("MockOptimisticOracleV3");
  const mockOOv3 = await MockOOv3.deploy();
  await mockOOv3.waitForDeployment();

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
    TESTNET_CONFIG.UMA_MINIMUM_BOND
  );
  await escrow.waitForDeployment();

  const mintAmount = ethers.parseEther("1000000");
  await mockToken.mint(await client.getAddress(), mintAmount);
  await mockToken.mint(await agent.getAddress(), mintAmount);

  const deployTx = escrow.deploymentTransaction();
  const deploymentBlock = deployTx
    ? (await deployTx.wait()).blockNumber
    : (await ethers.provider.getBlockNumber());
  const rpcUrl = process.env.PLASMA_RPC_URL ?? "https://testnet-rpc.plasma.to";
  const deployment = {
    chainId: 9746,
    network: "plasma-testnet",
    contracts: {
      MockToken: await mockToken.getAddress(),
      MockOOv3: await mockOOv3.getAddress(),
      AgentTaskEscrow: await escrow.getAddress(),
    },
    sdk: {
      escrowAddress: await escrow.getAddress(),
      mockTokenAddress: await mockToken.getAddress(),
      rpcUrl,
      deploymentBlock,
    },
  };

  const deployDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
  const deployPath = path.join(deployDir, "plasma-testnet.json");
  fs.writeFileSync(deployPath, JSON.stringify(deployment, null, 2), "utf8");
  console.log("Updated", deployPath);

  console.log("Deployed contracts:");
  console.log("  MockToken:", await mockToken.getAddress());
  console.log("  MockOOv3:", await mockOOv3.getAddress());
  console.log("  AgentTaskEscrow:", await escrow.getAddress());
  console.log("");
  console.log("SDK config (chainId: 9746):");
  console.log("  escrowAddress:", await escrow.getAddress());
  console.log("  mockTokenAddress:", await mockToken.getAddress());
  console.log("");
  console.log("Ensure these accounts are funded with XPL for gas:");
  console.log("  Deployer:", await deployer.getAddress());
  console.log("  Client:", await client.getAddress());
  console.log("  Agent:", await agent.getAddress());
  console.log("  MarketMaker:", await marketMaker.getAddress());
  console.log("");
  console.log("Run 'npm run print-addresses' to see addresses to fund (from MNEMONIC).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
