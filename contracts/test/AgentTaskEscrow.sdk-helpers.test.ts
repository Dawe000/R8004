import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  ClientSDK,
  AgentSDK,
  getTasksByClient,
  getTasksByAgent,
  getEscrowConfig,
  TaskStatus,
} from "@erc8001/agent-task-sdk";
import { deployFixture } from "./helpers/fixtures";
import { TEST_CONFIG } from "../config";

describe("AgentTaskEscrow - SDK helpers", function () {
  async function sdkFixture() {
    const f = await deployFixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const config = {
      escrowAddress: await f.escrow.getAddress(),
      chainId: Number(chainId),
    };
    const clientSdk = new ClientSDK(config, f.client);
    const agentSdk = new AgentSDK(config, f.agent);
    return { ...f, clientSdk, agentSdk };
  }

  it("getTasksByClient returns task with paymentToken and stakeToken", async function () {
    const { mockToken, client, clientSdk, agentSdk, escrow } =
      await loadFixture(sdkFixture);
    const tokenAddr = await mockToken.getAddress();
    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await clientSdk.createTask(
      "ipfs://description",
      tokenAddr,
      paymentAmount,
      deadline
    );
    await agentSdk.acceptTask(0n, stakeAmount);

    const provider = client.provider!;
    const escrowAddr = await escrow.getAddress();
    const clientAddr = await client.getAddress();
    const tasks = await getTasksByClient(escrowAddr, provider, clientAddr);
    expect(tasks).to.have.lengthOf(1);
    expect(tasks[0].id).to.equal(0n);
    expect(tasks[0].paymentToken).to.equal(tokenAddr);
    expect(tasks[0].status).to.equal(TaskStatus.Accepted);
    expect(tasks[0].paymentAmount).to.equal(paymentAmount);
    expect(tasks[0].agentStake).to.equal(stakeAmount);
  });

  it("getTasksByAgent returns task accepted by agent", async function () {
    const { mockToken, agent, clientSdk, agentSdk, escrow } =
      await loadFixture(sdkFixture);
    const tokenAddr = await mockToken.getAddress();
    const paymentAmount = ethers.parseEther("50");
    const stakeAmount = ethers.parseEther("5");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await clientSdk.createTask(
      "ipfs://desc",
      tokenAddr,
      paymentAmount,
      deadline
    );
    await agentSdk.acceptTask(0n, stakeAmount);

    const provider = agent.provider!;
    const escrowAddr = await escrow.getAddress();
    const agentAddr = await agent.getAddress();
    const tasks = await getTasksByAgent(escrowAddr, provider, agentAddr);
    expect(tasks).to.have.lengthOf(1);
    expect(tasks[0].id).to.equal(0n);
    expect(tasks[0].agent).to.equal(agentAddr);
    expect(tasks[0].status).to.equal(TaskStatus.Accepted);
  });

  it("getEscrowConfig returns expected timing and bond config", async function () {
    const { escrow, client } = await loadFixture(sdkFixture);
    const provider = client.provider!;
    const escrowAddr = await escrow.getAddress();
    const cfg = await getEscrowConfig(escrowAddr, provider);

    expect(cfg.cooldownPeriod).to.equal(BigInt(TEST_CONFIG.COOLDOWN_PERIOD));
    expect(cfg.agentResponseWindow).to.equal(
      BigInt(TEST_CONFIG.AGENT_RESPONSE_WINDOW)
    );
    expect(cfg.disputeBondBps).to.equal(TEST_CONFIG.DISPUTE_BOND_BPS);
    expect(cfg.escalationBondBps).to.equal(TEST_CONFIG.ESCALATION_BOND_BPS);
    expect(cfg.umaConfig).to.exist;
    expect(cfg.umaConfig.liveness).to.equal(BigInt(TEST_CONFIG.UMA_LIVENESS));
  });
});
