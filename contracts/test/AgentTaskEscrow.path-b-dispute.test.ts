import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advanceCooldown, advanceAgentResponseWindow } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";
import { logStep } from "./helpers/logger";

describe("AgentTaskEscrow - Path B (Dispute, Agent Concedes)", function () {
  it("client disputes, agent does nothing, client wins after response window", async function () {
    const { escrow, mockToken, client, agent } = await deployFixture();

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

    const result = "Task completed";
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(0n, resultHash, agent);

    await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

    const disputeBond = (paymentAmount * 100n) / 10000n;
    logStep("disputeTask", { taskId: 0, disputeBond: disputeBond.toString() });
    await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
    await escrow.connect(client).disputeTask(0, "ipfs://client-evidence");

    logStep("advanceCooldown + advanceAgentResponseWindow");
    await advanceCooldown();
    await advanceAgentResponseWindow();

    const clientBalanceBefore = await mockToken.balanceOf(await client.getAddress());
    logStep("settleAgentConceded", { taskId: 0 });
    await escrow.connect(client).settleAgentConceded(0);
    const clientBalanceAfter = await mockToken.balanceOf(await client.getAddress());

    const delta = clientBalanceAfter - clientBalanceBefore;
    logStep("client payout", { delta: delta.toString(), expected: "payment + disputeBond + stake" });
    expect(delta).to.equal(paymentAmount + disputeBond + stakeAmount);
  });
});
