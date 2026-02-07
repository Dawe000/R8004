import type { Signer } from "ethers";
import type { SDKConfig } from "./config";
import type { Task, TaskMatchRequest, TaskMatchResponse } from "./types";
import {
  getEscrowContract,
  getErc20Contract,
  parseTask,
  ensureAllowance,
<<<<<<< HEAD
} from "./contract.js";
import {
  getTasksByClient,
  getClientTasksNeedingAction,
  isInProgress,
} from "./tasks.js";
import { uploadJson, fetchTaskEvidence } from "./ipfs.js";
import { matchAgents } from "./marketmaker.js";

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
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    const raw = await escrow.getTask(taskId);
    return parseTask(raw);
  }

  /**
   * Create task. Pass descriptionURI string directly, or spec object to upload to IPFS (requires config.ipfs).
   */
  async createTask(
    descriptionUriOrSpec: string | Record<string, unknown>,
    paymentToken: string,
    paymentAmount: bigint,
    deadline: number | bigint
  ): Promise<bigint> {
    let uri: string;
    if (typeof descriptionUriOrSpec === "string") {
      uri = descriptionUriOrSpec;
    } else {
      if (!this.config.ipfs) {
        throw new Error("IPFS config required when passing spec object");
      }
      uri = await uploadJson(descriptionUriOrSpec, this.config.ipfs);
    }

    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    const nextId = await escrow.nextTaskId();
    await (await escrow.createTask(
      uri,
      paymentToken,
      paymentAmount,
      BigInt(deadline)
    )).wait();
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
