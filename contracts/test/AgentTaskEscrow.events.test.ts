import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advanceCooldown, advancePastDeadline } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";
import { logEvent } from "./helpers/logger";

describe("AgentTaskEscrow - Events", function () {
  describe("Path A (Happy Path) events", function () {
    it("emits expected event sequence", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await expect(
        escrow.connect(client).createTask(
          "ipfs://description",
          await mockToken.getAddress(),
          paymentAmount,
          deadline,
          ethers.ZeroAddress
        )
      )
        .to.emit(escrow, "TaskCreated")
        .withArgs(0, await client.getAddress(), "ipfs://description");

      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await expect(escrow.connect(agent).acceptTask(0, stakeAmount))
        .to.emit(escrow, "TaskAccepted")
        .withArgs(0, await agent.getAddress(), stakeAmount);

      await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
      await expect(escrow.connect(client).depositPayment(0))
        .to.emit(escrow, "PaymentDeposited")
        .withArgs(0, await mockToken.getAddress(), paymentAmount);

      const result = "Task completed successfully";
      const resultHash = calculateResultHash(result);
      const signature = await signTaskResult(0n, resultHash, agent);

      await expect(escrow.connect(agent).assertCompletion(0, resultHash, signature, ""))
        .to.emit(escrow, "TaskResultAsserted")
        .withArgs(0, resultHash, await agent.getAddress());

      await advanceCooldown();

      await expect(escrow.connect(agent).settleNoContest(0))
        .to.emit(escrow, "TaskResolved")
        .withArgs(0, 8, true); // TaskStatus.Resolved = 8
    });
  });

  describe("Path B (Dispute, Agent Concedes) events", function () {
    it("emits TaskDisputed and TaskResolved", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();
      const { advanceAgentResponseWindow } = await import("./helpers/time");

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
      await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + ethers.parseEther("1000"));
      await escrow.connect(client).depositPayment(0);

      const resultHash = calculateResultHash("result");
      const signature = await signTaskResult(0n, resultHash, agent);
      await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

      const disputeBond = (paymentAmount * 100n) / 10000n;
      await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);

      await expect(escrow.connect(client).disputeTask(0, "ipfs://client-evidence"))
        .to.emit(escrow, "TaskDisputed")
        .withArgs(0, await client.getAddress(), disputeBond, "ipfs://client-evidence");

      await advanceCooldown();
      await advanceAgentResponseWindow();

      await expect(escrow.connect(client).settleAgentConceded(0))
        .to.emit(escrow, "TaskResolved")
        .withArgs(0, 8, false);
    });
  });

  describe("Path B (UMA) events", function () {
    it("emits TaskDisputeEscalated and TaskResolved via callback", async function () {
      const { escrow, mockToken, mockOOv3, client, agent } = await deployFixture();
      const { advanceUmaLiveness } = await import("./helpers/time");

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

      const tx = await escrow.connect(agent).escalateToUMA(0, "ipfs://agent-evidence");
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
      const escalatedLog = receipt!.logs.find((l) => {
        try {
          const parsed = escrow.interface.parseLog({ topics: l.topics as string[], data: l.data });
          return parsed?.name === "TaskDisputeEscalated";
        } catch {
          return false;
        }
      });
      expect(escalatedLog).to.not.be.undefined;

      const task = await escrow.getTask(0);
      await advanceUmaLiveness();
      await mockOOv3.pushResolution(task.umaAssertionId, true);

      const taskAfter = await escrow.getTask(0);
      expect(taskAfter.status).to.equal(8);
    });
  });

  describe("Path C (Timeout) events", function () {
    it("emits TaskTimeoutCancelled", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 60;

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

      await advancePastDeadline(deadline);

      await expect(escrow.connect(client).timeoutCancellation(0, "deadline exceeded"))
        .to.emit(escrow, "TaskTimeoutCancelled")
        .withArgs(0);
    });
  });

  describe("Path D (Agent Cannot Complete) events", function () {
    it("emits TaskAgentFailure", async function () {
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

      await expect(escrow.connect(agent).cannotComplete(0, "resource unavailable"))
        .to.emit(escrow, "TaskAgentFailure")
        .withArgs(0, "");
    });
  });
});
