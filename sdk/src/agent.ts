import type { Signer } from "ethers";
import type { SDKConfig } from "./config";
import type { Task } from "./types";
import {
  getEscrowContract,
  parseTask,
  ensureAllowance,
} from "./contract";
import { calculateResultHash, signTaskResult } from "./crypto";
import { uploadJson } from "./ipfs";

export class AgentSDK {
  constructor(
    private config: SDKConfig,
    private signer: Signer
  ) {}

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
   */
  async assertCompletion(
    taskId: bigint,
    result: string | Uint8Array
  ): Promise<void> {
    const resultHash = calculateResultHash(result);
    const signature = await signTaskResult(taskId, resultHash, this.signer);
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (
      await escrow.assertCompletion(taskId, resultHash, signature)
    ).wait();
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

  /** Signal agent cannot complete */
  async cannotComplete(taskId: bigint, reason: string): Promise<void> {
    const escrow = getEscrowContract(this.config.escrowAddress, this.signer);
    await (await escrow.cannotComplete(taskId, reason)).wait();
  }
}
