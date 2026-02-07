import type { Signer } from "ethers";
import type { SDKConfig } from "./config";
import type { Task } from "./types";
import {
  getEscrowContract,
  parseTask,
  ensureAllowance,
} from "./contract";
import {
  getTasksByAgent,
  getAgentTasksNeedingAction,
  isInProgress,
} from "./tasks";
import { calculateResultHash, signTaskResult } from "./crypto";
import { uploadJson, uploadText, isLikelyUri } from "./ipfs";

export class AgentSDK {
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

  /** Accept task with stake - approves token if needed */
  async acceptTask(taskId: bigint, stakeAmount: bigint): Promise<void> {
    const task = await this.getTask(taskId);
    await ensureAllowance(
      task.paymentToken,
      this.signer,
      this.config.escrowAddress,
      stakeAmount
    );
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.acceptTask(taskId, stakeAmount)).wait();
  }

  /**
   * Assert task completion with result. Hashes result, signs, and submits.
   * Optional resultUriOrObject: URI string (ipfs://, https://, etc.), plain text to upload,
   * or JSON object to upload. Plain text and object require config.ipfs.
   */
  async assertCompletion(
    taskId: bigint,
    result: string | Uint8Array,
    resultUriOrObject?: string | Record<string, unknown>
  ): Promise<void> {
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(taskId, resultHash, this.signer);

    let resultURI = "";
    if (resultUriOrObject !== undefined && resultUriOrObject !== null) {
      if (typeof resultUriOrObject === "string") {
        if (isLikelyUri(resultUriOrObject)) {
          resultURI = resultUriOrObject.trim();
        } else {
          if (!this.config.ipfs) {
            throw new Error("IPFS config required when passing plain text result URI");
          }
          resultURI = await uploadText(resultUriOrObject, this.config.ipfs);
        }
      } else {
        if (!this.config.ipfs) {
          throw new Error("IPFS config required when passing result object");
        }
        resultURI = await uploadJson(resultUriOrObject, this.config.ipfs);
      }
    }

    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.assertCompletion(taskId, resultHash, signature, resultURI)).wait();
  }

  /**
   * Escalate dispute to UMA. Pass evidence URI or object to upload (requires config.ipfs).
   */
  async escalateToUMA(
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
    const escalationBps = await escrow.escalationBondBps();
    const computedBond = (task.paymentAmount * escalationBps) / 10000n;
    const umaConfig = await escrow.umaConfig();
    const bond =
      computedBond > umaConfig.minimumBond ? computedBond : umaConfig.minimumBond;

    await ensureAllowance(
      task.paymentToken,
      this.signer,
      this.config.escrowAddress,
      bond
    );
    await (await escrow.escalateToUMA(taskId, uri)).wait();
  }

  /** Settle after cooldown with no dispute */
  async settleNoContest(taskId: bigint): Promise<void> {
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.settleNoContest(taskId)).wait();
  }

  /** Get tasks accepted by this agent (uses signer address) */
  async getMyTasks(inProgressOnly = false): Promise<Task[]> {
    const provider = this.getProvider();
    const address = await this.signer.getAddress();
    const tasks = await getTasksByAgent(
      this.config.escrowAddress,
      provider,
      address,
      this.config.deploymentBlock
    );
    if (inProgressOnly) return tasks.filter(isInProgress);
    return tasks;
  }

  /** Get tasks where this agent can take action (settleNoContest, escalateToUMA) */
  async getTasksNeedingAction(): Promise<Task[]> {
    const provider = this.getProvider();
    const address = await this.signer.getAddress();
    const block = await provider.getBlock("latest");
    const blockTimestamp = block?.timestamp ?? Math.floor(Date.now() / 1000);
    return getAgentTasksNeedingAction(
      this.config.escrowAddress,
      provider,
      address,
      blockTimestamp,
      { fromBlock: this.config.deploymentBlock }
    );
  }

  /** Signal agent cannot complete */
  async cannotComplete(taskId: bigint, reason: string): Promise<void> {
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.cannotComplete(taskId, reason)).wait();
  }
}
