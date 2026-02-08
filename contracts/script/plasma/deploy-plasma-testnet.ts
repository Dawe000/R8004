import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { TESTNET_CONFIG } from "../../config";

/** Plasma testnet USDT0 (ERC-20). See https://testnet.plasmascan.to/token/0x502012b361AebCE43b26Ec812B74D9a51dB4D412 */
const PLASMA_TESTNET_USDT = "0x502012b361AebCE43b26Ec812B74D9a51dB4D412";

async function main() {
  const useTestnetUsdt = process.env.PLASMA_USE_TESTNET_USDT === "1";
  const [deployer, client, agent, marketMaker] = await ethers.getSigners();

  console.log("Deploying to Plasma testnet...");
  if (useTestnetUsdt) console.log("  Mode: testnet USDT only (no mock token)");
  console.log("  Deployer:", await deployer.getAddress());
  console.log("  Client:", await client.getAddress());
  console.log("  Agent:", await agent.getAddress());
  console.log("  MarketMaker:", await marketMaker.getAddress());
  console.log("");

  let paymentTokenAddress: string;
  const contracts: Record<string, string> = {};

  if (useTestnetUsdt) {
    paymentTokenAddress = PLASMA_TESTNET_USDT;
    console.log("  Allowed token: Plasma testnet USDT", paymentTokenAddress);
  } else {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test Token", "TST", 18);
    await mockToken.waitForDeployment();
    paymentTokenAddress = await mockToken.getAddress();
    contracts.MockToken = paymentTokenAddress;
    const mintAmount = ethers.parseEther("1000000");
    await mockToken.mint(await client.getAddress(), mintAmount);
    await mockToken.mint(await agent.getAddress(), mintAmount);
  }

  const MockOOv3 = await ethers.getContractFactory("MockOptimisticOracleV3");
  const mockOOv3 = await MockOOv3.deploy();
  await mockOOv3.waitForDeployment();
  contracts.MockOOv3 = await mockOOv3.getAddress();

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
    [paymentTokenAddress]
  );
  await escrow.waitForDeployment();
  contracts.AgentTaskEscrow = await escrow.getAddress();

  const deployTx = escrow.deploymentTransaction();
  const deploymentBlock = deployTx
    ? (await deployTx.wait()).blockNumber
    : (await ethers.provider.getBlockNumber());
  const rpcUrl = process.env.PLASMA_RPC_URL ?? "https://testnet-rpc.plasma.to";
  const deployment = {
    chainId: 9746,
    network: "plasma-testnet",
    contracts,
    sdk: {
      escrowAddress: await escrow.getAddress(),
      mockTokenAddress: paymentTokenAddress,
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
  Object.entries(contracts).forEach(([name, addr]) => console.log(" ", name + ":", addr));
  if (useTestnetUsdt) {
    console.log("  Payment token (whitelist): Plasma testnet USDT", paymentTokenAddress);
  }
  console.log("");
  console.log("SDK config (chainId: 9746):");
  console.log("  escrowAddress:", await escrow.getAddress());
  console.log("  mockTokenAddress:", paymentTokenAddress);
  console.log("");
  console.log("Ensure these accounts are funded with XPL for gas:");
  console.log("  Deployer:", await deployer.getAddress());
  console.log("  Client:", await client.getAddress());
  console.log("  Agent:", await agent.getAddress());
  console.log("  MarketMaker:", await marketMaker.getAddress());
  if (useTestnetUsdt) {
    console.log("");
    console.log("Client and agent need testnet USDT at", paymentTokenAddress);
    console.log("(Get from faucet or bridge; no mint script for native USDT.)");
  }
  console.log("");
  console.log("Run 'npm run print-addresses' to see addresses to fund (from MNEMONIC).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
