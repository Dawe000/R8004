import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture, deployFixtureWithFee } from "./helpers/fixtures";
import { advanceCooldown } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";
import { logStep, logBalance } from "./helpers/logger";

describe("AgentTaskEscrow - Path A (Happy Path)", function () {
  it("full happy path: create -> accept -> deposit -> assert -> cooldown -> settle", async function () {
    const { escrow, mockToken, client, agent } = await deployFixture();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    logStep("createTask", { taskId: 0, client: await client.getAddress(), paymentAmount: paymentAmount.toString() });
    await escrow.connect(client).createTask(
      "ipfs://description",
      await mockToken.getAddress(),
      paymentAmount,
      deadline
    );

    logStep("acceptTask", { taskId: 0, agent: await agent.getAddress(), stakeAmount: stakeAmount.toString() });
    await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);

    logStep("depositPayment", { taskId: 0 });
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
    await escrow.connect(client).depositPayment(0);

    const result = "Task completed successfully";
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(0n, resultHash, agent);

    logStep("assertCompletion", { taskId: 0, resultHash });
    await escrow.connect(agent).assertCompletion(0, resultHash, signature);

    logStep("advanceCooldown");
    await advanceCooldown();

    const agentBalanceBeforeSettle = await mockToken.balanceOf(await agent.getAddress());
    logStep("settleNoContest", { taskId: 0 });
    await escrow.connect(agent).settleNoContest(0);
    const agentBalanceAfterSettle = await mockToken.balanceOf(await agent.getAddress());

    const delta = agentBalanceAfterSettle - agentBalanceBeforeSettle;
    logBalance("agent", delta, `+${delta} (payment ${paymentAmount} + stake ${stakeAmount})`);
    expect(delta).to.equal(paymentAmount + stakeAmount);
  });

  it("market maker receives fee on settlement", async function () {
    const { escrow, mockToken, client, agent, marketMaker } = await deployFixtureWithFee(10);

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await escrow.connect(client).createTask(
      "ipfs://description",
      await mockToken.getAddress(),
      paymentAmount,
      deadline
    );
    await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
    await escrow.connect(client).depositPayment(0);

    const resultHash = calculateResultHash("Task completed");
    const signature = await signTaskResult(0n, resultHash, agent);
    await escrow.connect(agent).assertCompletion(0, resultHash, signature);

    await advanceCooldown();

    const mmBalanceBefore = await mockToken.balanceOf(await marketMaker.getAddress());
    await escrow.connect(agent).settleNoContest(0);
    const mmBalanceAfter = await mockToken.balanceOf(await marketMaker.getAddress());

    const feeReceived = mmBalanceAfter - mmBalanceBefore;
    const expectedFee = (paymentAmount * 10n) / 10000n;
    logBalance("marketMaker", feeReceived, `MM fee received (0.1% of ${paymentAmount})`);
    expect(feeReceived).to.equal(expectedFee);
  });
});
