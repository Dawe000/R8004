import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advanceUmaLiveness } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";

describe("AgentTaskEscrow - UMA", function () {
  async function setupDisputedTask() {
    const { escrow, mockToken, mockOOv3, client, agent } = await deployFixture();
    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await escrow.connect(client).createTask(
      "ipfs://desc",
      await mockToken.getAddress(),
      paymentAmount,
      deadline
    );
    await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount + ethers.parseEther("1000"));
    await escrow.connect(agent).acceptTask(0, stakeAmount);
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + ethers.parseEther("1000"));
    await escrow.connect(client).depositPayment(0);

    const resultHash = calculateResultHash("result");
    const signature = await signTaskResult(0n, resultHash, agent);
    await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

    const disputeBond = (paymentAmount * 100n) / 10000n;
    await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
    await escrow.connect(client).disputeTask(0, "ipfs://client-evidence");

    const escalationBond = (paymentAmount * 100n) / 10000n;
    const bond = escalationBond > 1000000n ? escalationBond : 1000000n;
    await mockToken.connect(agent).approve(await escrow.getAddress(), bond);
    await escrow.connect(agent).escalateToUMA(0, "ipfs://agent-evidence");

    const task = await escrow.getTask(0);
    return { escrow, mockToken, mockOOv3, client, agent, task, paymentAmount, stakeAmount, disputeBond, bond };
  }

  it("escalateToUMA emits nonzero assertionId", async function () {
    const { task } = await setupDisputedTask();
    expect(task.umaAssertionId).to.not.equal(ethers.ZeroHash);
  });

  it("pushResolution(true) settles escrow and agent receives payout", async function () {
    const { escrow, mockToken, mockOOv3, agent, task, paymentAmount, stakeAmount } = await setupDisputedTask();

    await advanceUmaLiveness();
    await mockOOv3.pushResolution(task.umaAssertionId, true);

    const taskAfter = await escrow.getTask(0);
    expect(taskAfter.status).to.equal(8); // Resolved

    const agentBalance = await mockToken.balanceOf(await agent.getAddress());
    expect(agentBalance).to.be.gt(ethers.parseEther("1000000"));
  });

  it("pushResolution can be called by third party", async function () {
    const { escrow, mockToken, mockOOv3, agent, task } = await setupDisputedTask();
    const [, , , , , thirdParty] = await ethers.getSigners();

    await advanceUmaLiveness();
    await mockOOv3.connect(thirdParty).pushResolution(task.umaAssertionId, true);

    const taskAfter = await escrow.getTask(0);
    expect(taskAfter.status).to.equal(8);
  });

  it("pushResolution reverts on double call", async function () {
    const { mockOOv3, task } = await setupDisputedTask();

    await advanceUmaLiveness();
    await mockOOv3.pushResolution(task.umaAssertionId, true);

    await expect(
      mockOOv3.pushResolution(task.umaAssertionId, false)
    ).to.be.revertedWith("MockOOv3: already settled");
  });

  it("assertionResolvedCallback reverts when called by non-oracle", async function () {
    const { escrow, mockOOv3, task } = await setupDisputedTask();
    const [, , , , , randomCaller] = await ethers.getSigners();

    await advanceUmaLiveness();

    const abi = ["function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully)"];
    const iface = new ethers.Interface(abi);
    const calldata = iface.encodeFunctionData("assertionResolvedCallback", [task.umaAssertionId, true]);

    await expect(
      randomCaller.sendTransaction({
        to: await escrow.getAddress(),
        data: calldata,
      })
    ).to.be.revertedWithCustomError(escrow, "InvalidCaller");
  });

  it("MockOOv3 disputeAssertion emits event, then pushResolution works", async function () {
    const { escrow, mockOOv3, task } = await setupDisputedTask();
    const [disputer] = await ethers.getSigners();

    await expect(mockOOv3.disputeAssertion(task.umaAssertionId, await disputer.getAddress()))
      .to.emit(mockOOv3, "AssertionDisputed")
      .withArgs(task.umaAssertionId, await disputer.getAddress());

    const taskBefore = await escrow.getTask(0);
    expect(taskBefore.status).to.equal(5); // EscalatedToUMA

    await advanceUmaLiveness();
    await mockOOv3.pushResolution(task.umaAssertionId, true);

    const taskAfter = await escrow.getTask(0);
    expect(taskAfter.status).to.equal(8);
  });

  it("UMA agent wins: exact payout verification", async function () {
    const { escrow, mockToken, mockOOv3, client, agent, task, paymentAmount, stakeAmount } = await setupDisputedTask();
    const marketMaker = (await ethers.getSigners())[2];
    const agentBalanceBefore = await mockToken.balanceOf(await agent.getAddress());

    await advanceUmaLiveness();
    await mockOOv3.pushResolution(task.umaAssertionId, true);

    const agentBalanceAfter = await mockToken.balanceOf(await agent.getAddress());
    const taskAfter = await escrow.getTask(0);
    const expectedPayout = paymentAmount + stakeAmount + taskAfter.agentEscalationBond + taskAfter.clientDisputeBond;
    expect(agentBalanceAfter - agentBalanceBefore).to.equal(expectedPayout);
  });

  it("UMA client wins: exact payout verification", async function () {
    const { escrow, mockToken, mockOOv3, client, agent, task, paymentAmount } = await setupDisputedTask();
    const clientBalanceBefore = await mockToken.balanceOf(await client.getAddress());

    await advanceUmaLiveness();
    await mockOOv3.pushResolution(task.umaAssertionId, false);

    const clientBalanceAfter = await mockToken.balanceOf(await client.getAddress());
    const taskAfter = await escrow.getTask(0);
    const expectedPayout =
      paymentAmount +
      taskAfter.clientDisputeBond +
      taskAfter.agentStake +
      taskAfter.agentEscalationBond;
    expect(clientBalanceAfter - clientBalanceBefore).to.equal(expectedPayout);
  });
});
