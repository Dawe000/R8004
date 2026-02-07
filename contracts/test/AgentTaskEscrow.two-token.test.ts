import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixtureWithAllowedTokens } from "./helpers/fixtures";
import {
  advanceCooldown,
  advancePastDeadline,
  advanceAgentResponseWindow,
  advanceUmaLiveness,
} from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";

/** Deploy payment and stake tokens, mint, and deploy escrow with both whitelisted. */
async function setupTwoTokens() {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test Token", "TST", 18);
  await mockToken.waitForDeployment();
  const stakeToken = await MockERC20.deploy("Stake Token", "STAKE", 18);
  await stakeToken.waitForDeployment();
  const mintAmount = ethers.parseEther("1000000");
  await mockToken.mint((await ethers.getSigners())[0].getAddress(), mintAmount);
  await mockToken.mint((await ethers.getSigners())[1].getAddress(), mintAmount);
  await stakeToken.mint((await ethers.getSigners())[1].getAddress(), mintAmount);
  const { escrow, mockOOv3, client, agent } = await deployFixtureWithAllowedTokens([
    await mockToken.getAddress(),
    await stakeToken.getAddress(),
  ]);
  return { escrow, mockOOv3, mockToken, stakeToken, client, agent };
}

describe("AgentTaskEscrow - Two-token (payment vs stake)", function () {
  it("happy path: payment in paymentToken, stake in stakeToken, agent receives both correctly", async function () {
    const { escrow, mockToken, stakeToken, client, agent } = await setupTwoTokens();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    const paymentTokenAddr = await mockToken.getAddress();
    const stakeTokenAddr = await stakeToken.getAddress();

    await escrow.connect(client).createTask(
      "ipfs://description",
      paymentTokenAddr,
      paymentAmount,
      deadline,
      stakeTokenAddr
    );

    await stakeToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);

    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
    await escrow.connect(client).depositPayment(0);

    const resultHash = calculateResultHash("Task completed");
    const signature = await signTaskResult(0n, resultHash, agent);
    await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

    await advanceCooldown();

    const agentPaymentBefore = await mockToken.balanceOf(await agent.getAddress());
    const agentStakeBefore = await stakeToken.balanceOf(await agent.getAddress());
    await escrow.connect(agent).settleNoContest(0);
    const agentPaymentAfter = await mockToken.balanceOf(await agent.getAddress());
    const agentStakeAfter = await stakeToken.balanceOf(await agent.getAddress());

    expect(agentPaymentAfter - agentPaymentBefore).to.equal(paymentAmount);
    expect(agentStakeAfter - agentStakeBefore).to.equal(stakeAmount);
  });

  it("timeoutCancellation: client receives payment in paymentToken, slashed stake in stakeToken", async function () {
    const { escrow, mockToken, stakeToken, client, agent } = await setupTwoTokens();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 60;
    const paymentTokenAddr = await mockToken.getAddress();
    const stakeTokenAddr = await stakeToken.getAddress();

    await escrow.connect(client).createTask(
      "ipfs://description",
      paymentTokenAddr,
      paymentAmount,
      deadline,
      stakeTokenAddr
    );

    await stakeToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
    await escrow.connect(client).depositPayment(0);

    await advancePastDeadline(deadline);

    const clientPaymentBefore = await mockToken.balanceOf(await client.getAddress());
    const clientStakeBefore = await stakeToken.balanceOf(await client.getAddress());
    await escrow.connect(client).timeoutCancellation(0, "deadline exceeded");
    const clientPaymentAfter = await mockToken.balanceOf(await client.getAddress());
    const clientStakeAfter = await stakeToken.balanceOf(await client.getAddress());

    expect(clientPaymentAfter - clientPaymentBefore).to.equal(paymentAmount);
    expect(clientStakeAfter - clientStakeBefore).to.equal(stakeAmount);
  });

  it("cannotComplete: agent gets stake back in stakeToken, client gets payment in paymentToken", async function () {
    const { escrow, mockToken, stakeToken, client, agent } = await setupTwoTokens();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    const paymentTokenAddr = await mockToken.getAddress();
    const stakeTokenAddr = await stakeToken.getAddress();

    await escrow.connect(client).createTask(
      "ipfs://description",
      paymentTokenAddr,
      paymentAmount,
      deadline,
      stakeTokenAddr
    );

    await stakeToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
    await escrow.connect(client).depositPayment(0);

    const agentStakeBefore = await stakeToken.balanceOf(await agent.getAddress());
    const clientPaymentBefore = await mockToken.balanceOf(await client.getAddress());
    await escrow.connect(agent).cannotComplete(0, "resource unavailable");
    const agentStakeAfter = await stakeToken.balanceOf(await agent.getAddress());
    const clientPaymentAfter = await mockToken.balanceOf(await client.getAddress());

    expect(agentStakeAfter - agentStakeBefore).to.equal(stakeAmount);
    expect(clientPaymentAfter - clientPaymentBefore).to.equal(paymentAmount);
  });

  it("settleAgentConceded: client receives payment+bond in paymentToken, slashed stake in stakeToken", async function () {
    const { escrow, mockToken, stakeToken, client, agent } = await setupTwoTokens();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    const disputeBond = (paymentAmount * 100n) / 10000n;
    const paymentTokenAddr = await mockToken.getAddress();
    const stakeTokenAddr = await stakeToken.getAddress();

    await escrow.connect(client).createTask(
      "ipfs://description",
      paymentTokenAddr,
      paymentAmount,
      deadline,
      stakeTokenAddr
    );

    await stakeToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + disputeBond);
    await escrow.connect(client).depositPayment(0);

    const resultHash = calculateResultHash("result");
    const signature = await signTaskResult(0n, resultHash, agent);
    await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");
    await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
    await escrow.connect(client).disputeTask(0, "ipfs://client-evidence");

    await advanceCooldown();
    await advanceAgentResponseWindow();

    const clientPaymentBefore = await mockToken.balanceOf(await client.getAddress());
    const clientStakeBefore = await stakeToken.balanceOf(await client.getAddress());
    await escrow.connect(client).settleAgentConceded(0);
    const clientPaymentAfter = await mockToken.balanceOf(await client.getAddress());
    const clientStakeAfter = await stakeToken.balanceOf(await client.getAddress());

    expect(clientPaymentAfter - clientPaymentBefore).to.equal(paymentAmount + disputeBond);
    expect(clientStakeAfter - clientStakeBefore).to.equal(stakeAmount);
  });

  it("UMA agent wins: agent receives payment+bonds in paymentToken, stake in stakeToken", async function () {
    const { escrow, mockToken, mockOOv3, stakeToken, client, agent } = await setupTwoTokens();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    const disputeBond = (paymentAmount * 100n) / 10000n;
    const escalationBond = (paymentAmount * 100n) / 10000n;
    const bond = escalationBond > 1000000n ? escalationBond : 1000000n;
    const paymentTokenAddr = await mockToken.getAddress();
    const stakeTokenAddr = await stakeToken.getAddress();

    await escrow.connect(client).createTask(
      "ipfs://description",
      paymentTokenAddr,
      paymentAmount,
      deadline,
      stakeTokenAddr
    );

    await stakeToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + disputeBond);
    await escrow.connect(client).depositPayment(0);

    const resultHash = calculateResultHash("result");
    const signature = await signTaskResult(0n, resultHash, agent);
    await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");
    await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
    await escrow.connect(client).disputeTask(0, "ipfs://client-evidence");
    await mockToken.connect(agent).approve(await escrow.getAddress(), bond);
    await escrow.connect(agent).escalateToUMA(0, "ipfs://agent-evidence");

    const task = await escrow.getTask(0);
    const agentPaymentBefore = await mockToken.balanceOf(await agent.getAddress());
    const agentStakeBefore = await stakeToken.balanceOf(await agent.getAddress());
    await advanceUmaLiveness();
    await mockOOv3.pushResolution(task.umaAssertionId, true);
    const agentPaymentAfter = await mockToken.balanceOf(await agent.getAddress());
    const agentStakeAfter = await stakeToken.balanceOf(await agent.getAddress());

    const taskAfter = await escrow.getTask(0);
    const expectedAgentPayment =
      paymentAmount + taskAfter.clientDisputeBond + taskAfter.agentEscalationBond;
    expect(agentPaymentAfter - agentPaymentBefore).to.equal(expectedAgentPayment);
    expect(agentStakeAfter - agentStakeBefore).to.equal(stakeAmount);
  });

  it("UMA client wins: client receives payment+bonds in paymentToken, slashed stake in stakeToken", async function () {
    const { escrow, mockToken, mockOOv3, stakeToken, client, agent } = await setupTwoTokens();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    const disputeBond = (paymentAmount * 100n) / 10000n;
    const escalationBond = (paymentAmount * 100n) / 10000n;
    const bond = escalationBond > 1000000n ? escalationBond : 1000000n;
    const paymentTokenAddr = await mockToken.getAddress();
    const stakeTokenAddr = await stakeToken.getAddress();

    await escrow.connect(client).createTask(
      "ipfs://description",
      paymentTokenAddr,
      paymentAmount,
      deadline,
      stakeTokenAddr
    );

    await stakeToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + disputeBond);
    await escrow.connect(client).depositPayment(0);

    const resultHash = calculateResultHash("result");
    const signature = await signTaskResult(0n, resultHash, agent);
    await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");
    await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
    await escrow.connect(client).disputeTask(0, "ipfs://client-evidence");
    await mockToken.connect(agent).approve(await escrow.getAddress(), bond);
    await escrow.connect(agent).escalateToUMA(0, "ipfs://agent-evidence");

    const task = await escrow.getTask(0);
    const clientPaymentBefore = await mockToken.balanceOf(await client.getAddress());
    const clientStakeBefore = await stakeToken.balanceOf(await client.getAddress());
    await advanceUmaLiveness();
    await mockOOv3.pushResolution(task.umaAssertionId, false);
    const clientPaymentAfter = await mockToken.balanceOf(await client.getAddress());
    const clientStakeAfter = await stakeToken.balanceOf(await client.getAddress());

    const taskAfter = await escrow.getTask(0);
    const expectedClientPayment =
      paymentAmount + taskAfter.clientDisputeBond + taskAfter.agentEscalationBond;
    expect(clientPaymentAfter - clientPaymentBefore).to.equal(expectedClientPayment);
    expect(clientStakeAfter - clientStakeBefore).to.equal(stakeAmount);
  });
});
