import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { TEST_CONFIG } from "../../config";

export interface FixtureResult {
  escrow: Awaited<ReturnType<typeof ethers.getContractAt>>;
  mockOOv3: Awaited<ReturnType<typeof ethers.getContractAt>>;
  mockToken: Awaited<ReturnType<typeof ethers.getContractAt>>;
  client: Awaited<ReturnType<typeof ethers.getSigner>>;
  agent: Awaited<ReturnType<typeof ethers.getSigner>>;
  marketMaker: Awaited<ReturnType<typeof ethers.getSigner>>;
}

export async function deployFixture(): Promise<FixtureResult> {
  const [client, agent, marketMaker] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test Token", "TST", 18);
  await mockToken.waitForDeployment();

  const MockOOv3 = await ethers.getContractFactory("MockOptimisticOracleV3");
  const mockOOv3 = await MockOOv3.deploy();
  await mockOOv3.waitForDeployment();

  const AgentTaskEscrow = await ethers.getContractFactory("AgentTaskEscrow");
  const escrow = await AgentTaskEscrow.deploy(
    await marketMaker.getAddress(),
    0, // marketMakerFeeBps
    TEST_CONFIG.COOLDOWN_PERIOD,
    TEST_CONFIG.AGENT_RESPONSE_WINDOW,
    TEST_CONFIG.DISPUTE_BOND_BPS,
    TEST_CONFIG.ESCALATION_BOND_BPS,
    await mockOOv3.getAddress(),
    TEST_CONFIG.UMA_LIVENESS,
    ethers.keccak256(ethers.toUtf8Bytes("AGENT_TASK_V1")),
    TEST_CONFIG.UMA_MINIMUM_BOND,
    [await mockToken.getAddress()]
  );
  await escrow.waitForDeployment();

  const mintAmount = ethers.parseEther("1000000");
  await mockToken.mint(await client.getAddress(), mintAmount);
  await mockToken.mint(await agent.getAddress(), mintAmount);

  return { escrow, mockOOv3, mockToken, client, agent, marketMaker };
}

export function useFixture() {
  return loadFixture(deployFixture);
}

export async function deployFixtureWithFee(marketMakerFeeBps: number): Promise<FixtureResult> {
  const [client, agent, marketMaker] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test Token", "TST", 18);
  await mockToken.waitForDeployment();

  const MockOOv3 = await ethers.getContractFactory("MockOptimisticOracleV3");
  const mockOOv3 = await MockOOv3.deploy();
  await mockOOv3.waitForDeployment();

  const AgentTaskEscrow = await ethers.getContractFactory("AgentTaskEscrow");
  const escrow = await AgentTaskEscrow.deploy(
    await marketMaker.getAddress(),
    marketMakerFeeBps,
    TEST_CONFIG.COOLDOWN_PERIOD,
    TEST_CONFIG.AGENT_RESPONSE_WINDOW,
    TEST_CONFIG.DISPUTE_BOND_BPS,
    TEST_CONFIG.ESCALATION_BOND_BPS,
    await mockOOv3.getAddress(),
    TEST_CONFIG.UMA_LIVENESS,
    ethers.keccak256(ethers.toUtf8Bytes("AGENT_TASK_V1")),
    TEST_CONFIG.UMA_MINIMUM_BOND,
    [await mockToken.getAddress()]
  );
  await escrow.waitForDeployment();

  const mintAmount = ethers.parseEther("1000000");
  await mockToken.mint(await client.getAddress(), mintAmount);
  await mockToken.mint(await agent.getAddress(), mintAmount);

  return { escrow, mockOOv3, mockToken, client, agent, marketMaker };
}

/** Result of deployFixtureWithAllowedTokens - no mockToken; caller supplies tokens. */
export interface FixtureResultWithAllowedTokens {
  escrow: Awaited<ReturnType<typeof ethers.getContractAt>>;
  mockOOv3: Awaited<ReturnType<typeof ethers.getContractAt>>;
  client: Awaited<ReturnType<typeof ethers.getSigner>>;
  agent: Awaited<ReturnType<typeof ethers.getSigner>>;
  marketMaker: Awaited<ReturnType<typeof ethers.getSigner>>;
}

/** Deploy escrow with a custom token whitelist. Caller must deploy and mint tokens; use for two-token tests. */
export async function deployFixtureWithAllowedTokens(
  allowedTokenAddresses: string[]
): Promise<FixtureResultWithAllowedTokens> {
  const [client, agent, marketMaker] = await ethers.getSigners();

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
    TEST_CONFIG.UMA_MINIMUM_BOND,
    allowedTokenAddresses
  );
  await escrow.waitForDeployment();

  return { escrow, mockOOv3, client, agent, marketMaker };
}
