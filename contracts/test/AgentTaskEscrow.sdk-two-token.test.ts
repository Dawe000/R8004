import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ClientSDK, AgentSDK, getTask } from "@erc8001/agent-task-sdk";
import { deployFixtureWithAllowedTokens } from "./helpers/fixtures";
import { advanceCooldown } from "./helpers/time";

describe("AgentTaskEscrow - SDK two-token flow", function () {
  async function twoTokenFixture() {
    const [client, agent, marketMaker] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const paymentToken = await MockERC20.deploy("Payment", "PAY", 18);
    await paymentToken.waitForDeployment();
    const stakeToken = await MockERC20.deploy("Stake", "STK", 18);
    await stakeToken.waitForDeployment();

    const paymentAddr = await paymentToken.getAddress();
    const stakeAddr = await stakeToken.getAddress();
    const f = await deployFixtureWithAllowedTokens([paymentAddr, stakeAddr]);

    const mintAmount = ethers.parseEther("1000000");
    await paymentToken.mint(await client.getAddress(), mintAmount);
    await paymentToken.mint(await agent.getAddress(), mintAmount);
    await stakeToken.mint(await client.getAddress(), mintAmount);
    await stakeToken.mint(await agent.getAddress(), mintAmount);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const config = {
      escrowAddress: await f.escrow.getAddress(),
      chainId: Number(chainId),
    };
    const clientSdk = new ClientSDK(config, client);
    const agentSdk = new AgentSDK(config, agent);
    return {
      ...f,
      paymentToken,
      stakeToken,
      paymentAddr,
      stakeAddr,
      client,
      agent,
      clientSdk,
      agentSdk,
    };
  }

  it("full happy path with payment and stake in different tokens via SDK", async function () {
    const {
      paymentToken,
      stakeToken,
      client,
      agent,
      clientSdk,
      agentSdk,
      paymentAddr,
      stakeAddr,
      escrow,
    } = await loadFixture(twoTokenFixture);

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const taskId = await clientSdk.createTask(
      "ipfs://description",
      paymentAddr,
      paymentAmount,
      deadline,
      stakeAddr
    );
    expect(taskId).to.equal(0n);

    const taskAfterCreate = await clientSdk.getTask(taskId);
    expect(taskAfterCreate.paymentToken).to.equal(paymentAddr);
    expect(taskAfterCreate.stakeToken).to.equal(stakeAddr);
    expect(taskAfterCreate.paymentAmount).to.equal(paymentAmount);

    await agentSdk.acceptTask(taskId, stakeAmount);
    await clientSdk.depositPayment(taskId);
    await agentSdk.assertCompletion(taskId, "Task completed successfully");
    await advanceCooldown();
    await agentSdk.settleNoContest(taskId);

    const agentPaymentBalance = await paymentToken.balanceOf(await agent.getAddress());
    const agentStakeBalance = await stakeToken.balanceOf(await agent.getAddress());
    expect(agentPaymentBalance).to.equal(
      ethers.parseEther("1000000") - 0n + paymentAmount
    );
    expect(agentStakeBalance).to.equal(
      ethers.parseEther("1000000") - stakeAmount + stakeAmount
    );
  });

  it("getTask(escrow, provider, taskId) returns task with stakeToken", async function () {
    const {
      clientSdk,
      agentSdk,
      paymentAddr,
      stakeAddr,
      escrow,
      client,
    } = await loadFixture(twoTokenFixture);
    const paymentAmount = ethers.parseEther("50");
    const stakeAmount = ethers.parseEther("5");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await clientSdk.createTask(
      "ipfs://desc",
      paymentAddr,
      paymentAmount,
      deadline,
      stakeAddr
    );
    await agentSdk.acceptTask(0n, stakeAmount);

    const provider = client.provider!;
    const escrowAddr = await escrow.getAddress();
    const task = await getTask(escrowAddr, provider, 0n);
    expect(task.paymentToken).to.equal(paymentAddr);
    expect(task.stakeToken).to.equal(stakeAddr);
    expect(task.agentStake).to.equal(stakeAmount);
  });
});
