import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advanceCooldown } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";

describe("AgentTaskEscrow - Path A (Happy Path)", function () {
  it("full happy path: create -> accept -> deposit -> assert -> cooldown -> settle", async function () {
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

    const result = "Task completed successfully";
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(0n, resultHash, agent);

    await escrow.connect(agent).assertCompletion(0, resultHash, signature);

    await advanceCooldown();

    const agentBalanceBeforeSettle = await mockToken.balanceOf(await agent.getAddress());
    await escrow.connect(agent).settleNoContest(0);
    const agentBalanceAfterSettle = await mockToken.balanceOf(await agent.getAddress());

    expect(agentBalanceAfterSettle - agentBalanceBeforeSettle).to.equal(paymentAmount + stakeAmount);
  });
});
