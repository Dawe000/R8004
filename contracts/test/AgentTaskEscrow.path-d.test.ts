import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { logStep } from "./helpers/logger";

describe("AgentTaskEscrow - Path D (Agent Cannot Complete)", function () {
  it("agent signals cannot complete, both get refunds, no MM fee", async function () {
    const { escrow, mockToken, client, agent } = await deployFixture();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await escrow.connect(client).createTask(
      "ipfs://description",
      await mockToken.getAddress(),
      paymentAmount,
      deadline,
      ethers.ZeroAddress
    );

    await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(agent).acceptTask(0, stakeAmount);

    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
    await escrow.connect(client).depositPayment(0);

    const clientBalanceBefore = await mockToken.balanceOf(await client.getAddress());
    const agentBalanceBefore = await mockToken.balanceOf(await agent.getAddress());

    logStep("cannotComplete", { taskId: 0, reason: "resource unavailable" });
    await escrow.connect(agent).cannotComplete(0, "resource unavailable");

    const clientBalanceAfter = await mockToken.balanceOf(await client.getAddress());
    const agentBalanceAfter = await mockToken.balanceOf(await agent.getAddress());

    logStep("refunds", { clientDelta: (clientBalanceAfter - clientBalanceBefore).toString(), agentDelta: (agentBalanceAfter - agentBalanceBefore).toString() });
    expect(clientBalanceAfter - clientBalanceBefore).to.equal(paymentAmount);
    expect(agentBalanceAfter - agentBalanceBefore).to.equal(stakeAmount);
  });
});
