/**
 * Durable Object: tracks processed assertion IDs for idempotency.
 * Prevents double-processing of UMA disputes across cron runs.
 */
import { DurableObject } from "cloudflare:workers";

const PROCESSED_PREFIX = "processed:";

export class DvmState extends DurableObject {
  async isProcessed(assertionId: string): Promise<boolean> {
    const key = PROCESSED_PREFIX + assertionId.toLowerCase();
    const value = await this.ctx.storage.get(key);
    return value === "1";
  }

  async markProcessed(assertionId: string): Promise<void> {
    const key = PROCESSED_PREFIX + assertionId.toLowerCase();
    await this.ctx.storage.put(key, "1");
  }
}
