import { time } from "@nomicfoundation/hardhat-network-helpers";
import { TEST_CONFIG } from "../../config";

/**
 * Time manipulation utilities for Hardhat tests.
 * Uses short durations from TEST_CONFIG for fast testing.
 * Note: time.increase and time.increaseTo already mine blocks.
 */

export async function advanceCooldown(): Promise<void> {
  await time.increase(TEST_CONFIG.COOLDOWN_PERIOD);
}

export async function advanceAgentResponseWindow(): Promise<void> {
  await time.increase(TEST_CONFIG.AGENT_RESPONSE_WINDOW);
}

export async function advancePastDeadline(deadline: number | bigint): Promise<void> {
  const deadlineNum = typeof deadline === "bigint" ? Number(deadline) : deadline;
  const now = await time.latest();
  if (now < deadlineNum) {
    await time.increaseTo(deadlineNum + 1);
  }
}

export async function advanceUmaLiveness(): Promise<void> {
  await time.increase(TEST_CONFIG.UMA_LIVENESS);
}

export async function advanceSeconds(seconds: number): Promise<void> {
  await time.increase(seconds);
}

export async function getLatestBlockTimestamp(): Promise<number> {
  return time.latest();
}
