import { ethers } from "hardhat";
import { TEST_CONFIG } from "../config";

async function main() {
  const [deployer, client, agent, marketMaker] = await ethers.getSigners();

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
    TEST_CONFIG.COOLDOWN_PERIOD,
    TEST_CONFIG.AGENT_RESPONSE_WINDOW,
    TEST_CONFIG.DISPUTE_BOND_BPS,
    TEST_CONFIG.ESCALATION_BOND_BPS,
    await mockOOv3.getAddress(),
    TEST_CONFIG.UMA_LIVENESS,
    ethers.keccak256(ethers.toUtf8Bytes("AGENT_TASK_V1")),
    TEST_CONFIG.UMA_MINIMUM_BOND
  );
  await escrow.waitForDeployment();

  const mintAmount = ethers.parseEther("1000000");
  await mockToken.mint(await client.getAddress(), mintAmount);
  await mockToken.mint(await agent.getAddress(), mintAmount);

  console.log("Sandbox deployed:");
  console.log("  MockToken:", await mockToken.getAddress());
  console.log("  MockOOv3:", await mockOOv3.getAddress());
  console.log("  AgentTaskEscrow:", await escrow.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
