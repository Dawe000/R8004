import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advanceUmaLiveness } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";
import { logStep } from "./helpers/logger";

describe("AgentTaskEscrow - Path B (Dispute, UMA Resolution)", function () {
  it("client disputes, agent escalates, mock OOv3 resolves agent wins", async function () {
    const { escrow, mockToken, mockOOv3, client, agent } = await deployFixture();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await escrow.connect(client).createTask(
      "ipfs://description",
      await mockToken.getAddress(),
      paymentAmount,
      deadline
    );

    await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount + ethers.parseEther("1000"));
    await escrow.connect(agent).acceptTask(0, stakeAmount);

    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + ethers.parseEther("1000"));
    await escrow.connect(client).depositPayment(0);

    const result = "Task completed correctly";
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(0n, resultHash, agent);

    await escrow.connect(agent).assertCompletion(0, resultHash, signature);

    const disputeBond = (paymentAmount * 100n) / 10000n;
    await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
    await escrow.connect(client).disputeTask(0, "ipfs://client-evidence");

    const escalationBond = (paymentAmount * 100n) / 10000n;
    const bond = escalationBond > 1000000n ? escalationBond : 1000000n;
    await mockToken.connect(agent).approve(await escrow.getAddress(), bond);
    logStep("escalateToUMA", { taskId: 0 });
    await escrow.connect(agent).escalateToUMA(0, "ipfs://agent-evidence");

    const task = await escrow.getTask(0);
    const assertionId = task.umaAssertionId;
    logStep("escalated", { assertionId });

    logStep("advanceUmaLiveness");
    await advanceUmaLiveness();

    logStep("pushResolution", { assertionId, assertedTruthfully: true });
    await mockOOv3.pushResolution(assertionId, true);

    const taskAfter = await escrow.getTask(0);
    logStep("callback settled", { status: taskAfter.status });
    expect(taskAfter.status).to.equal(8); // Resolved enum value
  });

  it("client disputes, agent escalates, mock OOv3 resolves client wins", async function () {
    const { escrow, mockToken, mockOOv3, client, agent } = await deployFixture();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await escrow.connect(client).createTask(
      "ipfs://description",
      await mockToken.getAddress(),
      paymentAmount,
      deadline
    );

    await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount + ethers.parseEther("1000"));
    await escrow.connect(agent).acceptTask(0, stakeAmount);

    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + ethers.parseEther("1000"));
    await escrow.connect(client).depositPayment(0);

    const result = "Task completed";
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(0n, resultHash, agent);

    await escrow.connect(agent).assertCompletion(0, resultHash, signature);

    const disputeBond = (paymentAmount * 100n) / 10000n;
    await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
    await escrow.connect(client).disputeTask(0, "ipfs://client-evidence");

    const escalationBond = (paymentAmount * 100n) / 10000n;
    const bond = escalationBond > 1000000n ? escalationBond : 1000000n;
    await mockToken.connect(agent).approve(await escrow.getAddress(), bond);
    logStep("escalateToUMA", { taskId: 0 });
    await escrow.connect(agent).escalateToUMA(0, "ipfs://agent-evidence");

    const task = await escrow.getTask(0);
    const assertionId = task.umaAssertionId;
    logStep("advanceUmaLiveness + pushResolution(false)");
    await advanceUmaLiveness();
    await mockOOv3.pushResolution(assertionId, false);

    const clientBalance = await mockToken.balanceOf(await client.getAddress());
    logStep("client wins", { clientBalance: clientBalance.toString() });
    expect(clientBalance).to.be.gt(ethers.parseEther("1000000"));
  });
});
