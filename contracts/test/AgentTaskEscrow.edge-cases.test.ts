import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "./helpers/fixtures";
import { advanceCooldown } from "./helpers/time";
import { calculateResultHash, signTaskResult } from "./helpers/crypto";

describe("AgentTaskEscrow - Edge Cases", function () {
  describe("assertCompletion", function () {
    it("reverts when called by non-agent", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);

      const resultHash = calculateResultHash("result");
      const signature = await signTaskResult(0n, resultHash, agent);

      await expect(
        escrow.connect(client).assertCompletion(0, resultHash, signature, "")
      ).to.be.revertedWithCustomError(escrow, "NotTaskAgent");
    });

    it("reverts when signature is from wrong signer", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();
      const [, , , wrongSigner] = await ethers.getSigners();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);

      const resultHash = calculateResultHash("result");
      const signature = await signTaskResult(0n, resultHash, wrongSigner);

      await expect(
        escrow.connect(agent).assertCompletion(0, resultHash, signature, "")
      ).to.be.revertedWithCustomError(escrow, "InvalidSignature");
    });

    it("reverts when signature is corrupt", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);

      const resultHash = calculateResultHash("result");
      const corruptSignature = "0x" + "00".repeat(65);

      await expect(
        escrow.connect(agent).assertCompletion(0, resultHash, corruptSignature, "")
      ).to.be.reverted;
    });
  });

  describe("disputeTask", function () {
    it("reverts when called by non-client", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);
      await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
      await escrow.connect(client).depositPayment(0);

      const resultHash = calculateResultHash("result");
      const signature = await signTaskResult(0n, resultHash, agent);
      await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

      const disputeBond = (paymentAmount * 100n) / 10000n;
      await mockToken.connect(agent).approve(await escrow.getAddress(), disputeBond);

      await expect(
        escrow.connect(agent).disputeTask(0, "ipfs://evidence")
      ).to.be.revertedWithCustomError(escrow, "NotTaskClient");
    });

    it("reverts when disputing after cooldown expires", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);
      await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
      await escrow.connect(client).depositPayment(0);

      const resultHash = calculateResultHash("result");
      const signature = await signTaskResult(0n, resultHash, agent);
      await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

      await advanceCooldown();

      const disputeBond = (paymentAmount * 100n) / 10000n;
      await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);

      await expect(
        escrow.connect(client).disputeTask(0, "ipfs://evidence")
      ).to.be.revertedWithCustomError(escrow, "CooldownNotExpired");
    });
  });

  describe("settleNoContest", function () {
    it("reverts when settling before cooldown expires", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);
      await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount);
      await escrow.connect(client).depositPayment(0);

      const resultHash = calculateResultHash("result");
      const signature = await signTaskResult(0n, resultHash, agent);
      await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

      await expect(escrow.connect(agent).settleNoContest(0)).to.be.revertedWithCustomError(escrow, "CooldownNotExpired");
    });
  });

  describe("settleAgentConceded", function () {
    it("reverts when settling before response window expires", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);
      await mockToken.connect(client).approve(await escrow.getAddress(), paymentAmount + ethers.parseEther("1000"));
      await escrow.connect(client).depositPayment(0);

      const resultHash = calculateResultHash("result");
      const signature = await signTaskResult(0n, resultHash, agent);
      await escrow.connect(agent).assertCompletion(0, resultHash, signature, "");

      const disputeBond = (paymentAmount * 100n) / 10000n;
      await mockToken.connect(client).approve(await escrow.getAddress(), disputeBond);
      await escrow.connect(client).disputeTask(0, "ipfs://evidence");

      await expect(
        escrow.connect(client).settleAgentConceded(0)
      ).to.be.revertedWithCustomError(escrow, "CooldownNotExpired");
    });
  });

  describe("timeoutCancellation", function () {
    it("reverts when called before deadline", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);

      await expect(
        escrow.connect(client).timeoutCancellation(0, "too early")
      ).to.be.revertedWithCustomError(escrow, "DeadlineNotPassed");
    });

    it("reverts when called by non-client", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();
      const { advancePastDeadline } = await import("./helpers/time");

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 60;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);

      await advancePastDeadline(deadline);

      await expect(
        escrow.connect(agent).timeoutCancellation(0, "not client")
      ).to.be.revertedWithCustomError(escrow, "NotTaskClient");
    });
  });

  describe("cannotComplete", function () {
    it("reverts when called by non-agent", async function () {
      const { escrow, mockToken, client, agent } = await deployFixture();

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      await escrow.connect(client).createTask("ipfs://desc", await mockToken.getAddress(), paymentAmount, deadline, ethers.ZeroAddress);
      await mockToken.connect(agent).approve(await escrow.getAddress(), stakeAmount);
      await escrow.connect(agent).acceptTask(0, stakeAmount);

      await expect(
        escrow.connect(client).cannotComplete(0, "not agent")
      ).to.be.revertedWithCustomError(escrow, "NotTaskAgent");
    });
  });

  describe("getTask", function () {
    it("returns default struct for nonexistent taskId", async function () {
      const { escrow } = await deployFixture();

      const task = await escrow.getTask(999);
      expect(task.id).to.equal(0);
      expect(task.client).to.equal(ethers.ZeroAddress);
      expect(task.agent).to.equal(ethers.ZeroAddress);
      expect(task.status).to.equal(0); // None
    });
  });
});
