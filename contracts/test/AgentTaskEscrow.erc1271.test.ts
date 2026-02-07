import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advanceCooldown } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";
import { logStep } from "./helpers/logger";

describe("AgentTaskEscrow - ERC-1271 Smart Wallet", function () {
  it("smart wallet as agent: owner signs, wallet validates via ERC-1271", async function () {
    const { escrow, mockToken, client, agent } = await deployFixture();

    const MockERC1271Wallet = await ethers.getContractFactory("MockERC1271Wallet");
    const mockWallet = await MockERC1271Wallet.deploy(await agent.getAddress());
    await mockWallet.waitForDeployment();
    const walletAddress = await mockWallet.getAddress();

    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await mockToken.mint(walletAddress, ethers.parseEther("1000000"));

    logStep("createTask", { taskId: 0 });
    await escrow.connect(client).createTask(
      "ipfs://description",
      await mockToken.getAddress(),
      paymentAmount,
      deadline,
      ethers.ZeroAddress
    );

    logStep("acceptTask via mock wallet", { taskId: 0 });
    await mockWallet
      .connect(agent)
      .execute(
        await mockToken.getAddress(),
        mockToken.interface.encodeFunctionData("approve", [await escrow.getAddress(), stakeAmount])
      );
    await mockWallet
      .connect(agent)
      .execute(await escrow.getAddress(), escrow.interface.encodeFunctionData("acceptTask", [0, stakeAmount]));

    logStep("depositPayment", { taskId: 0 });
    await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
    await escrow.connect(client).depositPayment(0);

    const result = "Task completed successfully";
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(0n, resultHash, agent);

    logStep("assertCompletion via mock wallet", { taskId: 0 });
    await mockWallet
      .connect(agent)
      .execute(
        await escrow.getAddress(),
        escrow.interface.encodeFunctionData("assertCompletion", [0, resultHash, signature, ""])
      );

    logStep("advanceCooldown");
    await advanceCooldown();

    const walletBalanceBefore = await mockToken.balanceOf(walletAddress);
    logStep("settleNoContest", { taskId: 0 });
    await escrow.connect(agent).settleNoContest(0);
    const walletBalanceAfter = await mockToken.balanceOf(walletAddress);

    const delta = walletBalanceAfter - walletBalanceBefore;
    expect(delta).to.equal(paymentAmount + stakeAmount);
    logStep("payout", { walletReceived: delta.toString() });
  });
});
