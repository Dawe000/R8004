import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ClientSDK, AgentSDK } from "@erc8001/agent-task-sdk";
import { deployFixture, deployFixtureWithFee } from "./helpers/fixtures";
import {
  advanceCooldown,
  advanceAgentResponseWindow,
  advancePastDeadline,
  advanceUmaLiveness,
} from "./helpers/time";

describe("AgentTaskEscrow - SDK (All Flows)", function () {
  async function sdkFixture() {
    const f = await deployFixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const config = {
      escrowAddress: await f.escrow.getAddress(),
      chainId: Number(chainId),
    };
    const clientSdk = new ClientSDK(config, f.client);
    const agentSdk = new AgentSDK(config, f.agent);
    return { ...f, clientSdk, agentSdk };
  }

  describe("Path A (Happy Path)", function () {
    it("full happy path via SDK: create -> accept -> deposit -> assert -> settle", async function () {
      const { mockToken, client, agent, clientSdk, agentSdk } =
        await loadFixture(sdkFixture);

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const tokenAddr = await mockToken.getAddress();

      const taskId = await clientSdk.createTask(
        "ipfs://description",
        tokenAddr,
        paymentAmount,
        deadline
      );
      expect(taskId).to.equal(0n);

      await agentSdk.acceptTask(taskId, stakeAmount);
      await clientSdk.depositPayment(taskId);
      await agentSdk.assertCompletion(taskId, "Task completed successfully");

      await advanceCooldown();

      const agentBalanceBefore = await mockToken.balanceOf(
        await agent.getAddress()
      );
      await agentSdk.settleNoContest(taskId);
      const agentBalanceAfter = await mockToken.balanceOf(
        await agent.getAddress()
      );

      const delta = agentBalanceAfter - agentBalanceBefore;
      expect(delta).to.equal(paymentAmount + stakeAmount);
    });

    it("market maker receives fee via SDK", async function () {
      const f = await deployFixtureWithFee(10);
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const config = {
        escrowAddress: await f.escrow.getAddress(),
        chainId: Number(chainId),
      };
      const clientSdk = new ClientSDK(config, f.client);
      const agentSdk = new AgentSDK(config, f.agent);

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const tokenAddr = await f.mockToken.getAddress();

      await clientSdk.createTask(
        "ipfs://description",
        tokenAddr,
        paymentAmount,
        deadline
      );
      await agentSdk.acceptTask(0n, stakeAmount);
      await clientSdk.depositPayment(0n);
      await agentSdk.assertCompletion(0n, "Task completed");
      await advanceCooldown();

      const mmBalanceBefore = await f.mockToken.balanceOf(
        await f.marketMaker.getAddress()
      );
      await agentSdk.settleNoContest(0n);
      const mmBalanceAfter = await f.mockToken.balanceOf(
        await f.marketMaker.getAddress()
      );

      const feeReceived = mmBalanceAfter - mmBalanceBefore;
      const expectedFee = (paymentAmount * 10n) / 10000n;
      expect(feeReceived).to.equal(expectedFee);
    });
  });

  describe("Path B (Dispute, Agent Concedes)", function () {
    it("client disputes, agent concedes via SDK", async function () {
      const { mockToken, client, agent, clientSdk, agentSdk } =
        await loadFixture(sdkFixture);

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const tokenAddr = await mockToken.getAddress();

      await clientSdk.createTask(
        "ipfs://description",
        tokenAddr,
        paymentAmount,
        deadline
      );
      await agentSdk.acceptTask(0n, stakeAmount);
      await clientSdk.depositPayment(0n);
      await agentSdk.assertCompletion(0n, "Task completed");

      await clientSdk.disputeTask(0n, "ipfs://client-evidence");

      await advanceCooldown();
      await advanceAgentResponseWindow();

      const clientBalanceBefore = await mockToken.balanceOf(
        await client.getAddress()
      );
      await clientSdk.settleAgentConceded(0n);
      const clientBalanceAfter = await mockToken.balanceOf(
        await client.getAddress()
      );

      const disputeBond = (paymentAmount * 100n) / 10000n;
      const delta = clientBalanceAfter - clientBalanceBefore;
      expect(delta).to.equal(paymentAmount + disputeBond + stakeAmount);
    });
  });

  describe("Path B (Dispute, UMA Resolution)", function () {
    it("UMA agent wins via SDK", async function () {
      const { mockToken, mockOOv3, client, agent, clientSdk, agentSdk } =
        await loadFixture(sdkFixture);

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const tokenAddr = await mockToken.getAddress();

      await clientSdk.createTask(
        "ipfs://description",
        tokenAddr,
        paymentAmount,
        deadline
      );
      await agentSdk.acceptTask(0n, stakeAmount);
      await clientSdk.depositPayment(0n);
      await agentSdk.assertCompletion(0n, "Task completed correctly");

      await clientSdk.disputeTask(0n, "ipfs://client-evidence");
      await agentSdk.escalateToUMA(0n, "ipfs://agent-evidence");

      const task = await clientSdk.getTask(0n);
      const assertionId = task.umaAssertionId;

      await advanceUmaLiveness();
      await mockOOv3.pushResolution(assertionId, true);

      const taskAfter = await clientSdk.getTask(0n);
      expect(taskAfter.status).to.equal(8); // Resolved
    });

    it("UMA client wins via SDK", async function () {
      const { mockToken, mockOOv3, client, agent, clientSdk, agentSdk } =
        await loadFixture(sdkFixture);

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const tokenAddr = await mockToken.getAddress();

      await clientSdk.createTask(
        "ipfs://description",
        tokenAddr,
        paymentAmount,
        deadline
      );
      await agentSdk.acceptTask(0n, stakeAmount);
      await clientSdk.depositPayment(0n);
      await agentSdk.assertCompletion(0n, "Task completed");

      await clientSdk.disputeTask(0n, "ipfs://client-evidence");
      await agentSdk.escalateToUMA(0n, "ipfs://agent-evidence");

      const task = await clientSdk.getTask(0n);
      const assertionId = task.umaAssertionId;

      await advanceUmaLiveness();
      await mockOOv3.pushResolution(assertionId, false);

      const clientBalance = await mockToken.balanceOf(
        await client.getAddress()
      );
      expect(clientBalance).to.be.gt(ethers.parseEther("1000000"));
    });
  });

  describe("Path C (Timeout Cancellation)", function () {
    it("deadline exceeded, client cancels via SDK", async function () {
      const { mockToken, client, agent, clientSdk, agentSdk } =
        await loadFixture(sdkFixture);

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 60;
      const tokenAddr = await mockToken.getAddress();

      await clientSdk.createTask(
        "ipfs://description",
        tokenAddr,
        paymentAmount,
        deadline
      );
      await agentSdk.acceptTask(0n, stakeAmount);
      await clientSdk.depositPayment(0n);

      await advancePastDeadline(deadline);

      const clientBalanceBefore = await mockToken.balanceOf(
        await client.getAddress()
      );
      await clientSdk.timeoutCancellation(0n, "deadline exceeded");
      const clientBalanceAfter = await mockToken.balanceOf(
        await client.getAddress()
      );

      const delta = clientBalanceAfter - clientBalanceBefore;
      expect(delta).to.equal(paymentAmount + stakeAmount);
    });
  });

  describe("Path D (Agent Cannot Complete)", function () {
    it("agent cannot complete via SDK", async function () {
      const { mockToken, client, agent, clientSdk, agentSdk } =
        await loadFixture(sdkFixture);

      const paymentAmount = ethers.parseEther("100");
      const stakeAmount = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const tokenAddr = await mockToken.getAddress();

      await clientSdk.createTask(
        "ipfs://description",
        tokenAddr,
        paymentAmount,
        deadline
      );
      await agentSdk.acceptTask(0n, stakeAmount);
      await clientSdk.depositPayment(0n);

      const clientBalanceBefore = await mockToken.balanceOf(
        await client.getAddress()
      );
      const agentBalanceBefore = await mockToken.balanceOf(
        await agent.getAddress()
      );

      await agentSdk.cannotComplete(0n, "resource unavailable");

      const clientBalanceAfter = await mockToken.balanceOf(
        await client.getAddress()
      );
      const agentBalanceAfter = await mockToken.balanceOf(
        await agent.getAddress()
      );

      expect(clientBalanceAfter - clientBalanceBefore).to.equal(paymentAmount);
      expect(agentBalanceAfter - agentBalanceBefore).to.equal(stakeAmount);
    });
  });
});
