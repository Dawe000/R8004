import type { Signer } from "ethers";
import type { SDKConfig } from "./config";
import type { Task, TaskMatchRequest, TaskMatchResponse } from "./types";
import {
  getEscrowContract,
  getErc20Contract,
  ensureAllowance,
  isMissingRevertDataCall,
  readTaskCompat,
} from "./contract";
import {
  getTasksByClient,
  getClientTasksNeedingAction,
  isInProgress,
} from "./tasks";
import { uploadJson, uploadText, isLikelyUri, fetchTaskEvidence } from "./ipfs";
import { matchAgents } from "./marketmaker";

export class ClientSDK {
  constructor(
    private config: SDKConfig,
    private signer: Signer
  ) {}

  /** Get provider from signer; throws if not available */
  private getProvider() {
    const provider = this.signer.provider;
    if (!provider) throw new Error("Signer has no provider");
    return provider;
  }

  /** Get task by ID */
  async getTask(taskId: bigint): Promise<Task> {
    return readTaskCompat(this.config.escrowAddress, this.signer, taskId);
  }

  /** Read whether payment has been deposited for a task */
  async getPaymentDeposited(taskId: bigint): Promise<boolean> {
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    return escrow.paymentDeposited(taskId);
  }

  /** Check whether a token is in the escrow's allowed (whitelist) set for payments and staking */
  async isTokenAllowed(tokenAddress: string): Promise<boolean> {
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    try {
      return await escrow.allowedTokens(tokenAddress);
    } catch (error) {
      // Backward compatibility: older deployed escrows may not expose allowedTokens(address) publicly.
      if (isMissingRevertDataCall(error)) return true;
      throw error;
    }
  }

  /**
   * Create task. Pass descriptionURI string (ipfs://, https://, etc.), plain text to upload to IPFS,
   * or spec object to upload to IPFS. Plain text and spec require config.ipfs.
   * Optional stakeToken: when set, agent stakes in this token (default: paymentToken).
   * Validates that payment and stake tokens are in the escrow whitelist before submitting.
   */
  async createTask(
    descriptionUriOrSpec: string | Record<string, unknown>,
    paymentToken: string,
    paymentAmount: bigint,
    deadline: number | bigint,
    stakeToken?: string
  ): Promise<bigint> {
    if (!(await this.isTokenAllowed(paymentToken))) {
      throw new Error("Payment token is not allowed by this escrow");
    }
    const stakeTokenAddr = stakeToken ?? "0x0000000000000000000000000000000000000000";
    if (stakeTokenAddr !== "0x0000000000000000000000000000000000000000" && !(await this.isTokenAllowed(stakeTokenAddr))) {
      throw new Error("Stake token is not allowed by this escrow");
    }

    let uri: string;
    if (typeof descriptionUriOrSpec === "string") {
      if (isLikelyUri(descriptionUriOrSpec)) {
        uri = descriptionUriOrSpec;
      } else {
        if (!this.config.ipfs) {
          throw new Error("IPFS config required when passing plain text description");
        }
        uri = await uploadText(descriptionUriOrSpec, this.config.ipfs);
      }
    } else {
      if (!this.config.ipfs) {
        throw new Error("IPFS config required when passing spec object");
      }
      uri = await uploadJson(descriptionUriOrSpec, this.config.ipfs);
    }

    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    const nextId = await escrow.nextTaskId();

    try {
      await (
        await escrow["createTask(string,address,uint256,uint256,address)"](
          uri,
          paymentToken,
          paymentAmount,
          BigInt(deadline),
          stakeTokenAddr
        )
      ).wait();
    } catch (error) {
      // Backward compatibility: older deployed escrows use createTask(string,address,uint256,uint256).
      if (!isMissingRevertDataCall(error)) throw error;
      if (stakeTokenAddr !== "0x0000000000000000000000000000000000000000") {
        throw new Error(
          "This escrow does not support custom stakeToken in createTask (legacy 4-arg interface)."
        );
      }
      await (
        await escrow["createTask(string,address,uint256,uint256)"](
          uri,
          paymentToken,
          paymentAmount,
          BigInt(deadline)
        )
      ).wait();
    }

    return nextId;
  }

  /** Deposit payment for task - approves token if needed */
  async depositPayment(taskId: bigint): Promise<void> {
    const task = await this.getTask(taskId);
    const escrowAddr = this.config.escrowAddress;
    await ensureAllowance(
      task.paymentToken,
      this.signer,
      escrowAddr,
      task.paymentAmount
    );
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.depositPayment(taskId)).wait();
  }

  /**
   * Dispute task. Pass evidence URI string or evidence object to upload (requires config.ipfs).
   */
  async disputeTask(
    taskId: bigint,
    evidenceUriOrObject: string | Record<string, unknown>
  ): Promise<void> {
    let uri: string;
    if (typeof evidenceUriOrObject === "string") {
      uri = evidenceUriOrObject;
    } else {
      if (!this.config.ipfs) {
        throw new Error("IPFS config required when passing evidence object");
      }
      uri = await uploadJson(evidenceUriOrObject, this.config.ipfs);
    }

    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    const task = await this.getTask(taskId);
    const bps = await escrow.disputeBondBps();
    const bond = (task.paymentAmount * bps) / 10000n;
    await ensureAllowance(
      task.paymentToken,
      this.signer,
      this.config.escrowAddress,
      bond
    );
    await (await escrow.disputeTask(taskId, uri)).wait();
  }

  /** Settle after agent conceded (no escalation) */
  async settleAgentConceded(taskId: bigint): Promise<void> {
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.settleAgentConceded(taskId)).wait();
  }

  /** Cancel task due to timeout */
  async timeoutCancellation(taskId: bigint, reason: string): Promise<void> {
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.timeoutCancellation(taskId, reason)).wait();
  }

  /** Get tasks created by this client (uses signer address) */
  async getMyTasks(inProgressOnly = false): Promise<Task[]> {
    const provider = this.getProvider();
    const address = await this.signer.getAddress();
    const tasks = await getTasksByClient(
      this.config.escrowAddress,
      provider,
      address,
      this.config.deploymentBlock
    );
    if (inProgressOnly) return tasks.filter(isInProgress);
    return tasks;
  }

  /** Fetch client and agent evidence from task (from clientEvidenceURI, agentEvidenceURI) */
  async fetchEvidenceForTask(
    taskId: bigint,
    options?: { gateway?: string; asJson?: boolean }
  ): Promise<{ clientEvidence?: string | unknown; agentEvidence?: string | unknown }> {
    const task = await this.getTask(taskId);
    return fetchTaskEvidence(task, options);
  }

  /** Get tasks where this client can take action (dispute, settleAgentConceded, timeoutCancel) */
  async getTasksNeedingAction(): Promise<Task[]> {
    const provider = this.getProvider();
    const address = await this.signer.getAddress();
    const block = await provider.getBlock("latest");
    const blockTimestamp = block?.timestamp ?? Math.floor(Date.now() / 1000);
    return getClientTasksNeedingAction(
      this.config.escrowAddress,
      provider,
      address,
      blockTimestamp,
      { fromBlock: this.config.deploymentBlock }
    );
  }

  /** Match agents via market maker API (requires config.marketMakerUrl) */
  async matchAgents(request: TaskMatchRequest): Promise<TaskMatchResponse> {
    if (!this.config.marketMakerUrl) {
      throw new Error("marketMakerUrl required for matchAgents");
    }
    return matchAgents(this.config.marketMakerUrl, request);
  }
}
