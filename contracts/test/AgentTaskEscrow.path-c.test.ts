import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advancePastDeadline } from "./helpers/time";

describe("AgentTaskEscrow - Path C (Timeout Cancellation)", function () {
  it("deadline exceeded, client cancels, gets refund, agent stake slashed", async function () {
    const { escrow, mockToken, client, agent } = await deployFixture();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 60;

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

    await advancePastDeadline(deadline);

    const clientBalanceBefore = await mockToken.balanceOf(await client.getAddress());
    await escrow.connect(client).timeoutCancellation(0, "deadline exceeded");
    const clientBalanceAfter = await mockToken.balanceOf(await client.getAddress());

    expect(clientBalanceAfter - clientBalanceBefore).to.equal(paymentAmount + stakeAmount);
  });
});
