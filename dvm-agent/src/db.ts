/**
 * D1-backed state for DVM: processed assertions and last_checked_block.
 */

const META_LAST_CHECKED_BLOCK = "last_checked_block";

export interface D1State {
  isProcessed(assertionId: string): Promise<boolean>;
  markProcessed(assertionId: string): Promise<void>;
  getLastCheckedBlock(): Promise<number | null>;
  setLastCheckedBlock(block: number): Promise<void>;
}

export function createD1State(db: D1Database): D1State {
  return {
    async isProcessed(assertionId: string): Promise<boolean> {
      const key = assertionId.toLowerCase();
      const stmt = db.prepare(
        "SELECT 1 FROM processed_assertions WHERE assertion_id = ?"
      ).bind(key);
      const row = await stmt.first();
      return row != null;
    },

    async markProcessed(assertionId: string): Promise<void> {
      const key = assertionId.toLowerCase();
      await db.prepare(
        "INSERT OR REPLACE INTO processed_assertions (assertion_id, processed_at) VALUES (?, datetime('now'))"
      ).bind(key).run();
    },

    async getLastCheckedBlock(): Promise<number | null> {
      const stmt = db.prepare(
        "SELECT value FROM dvm_meta WHERE key = ?"
      ).bind(META_LAST_CHECKED_BLOCK);
      const row = await stmt.first<{ value: string }>();
      if (!row?.value) return null;
      const n = parseInt(row.value, 10);
      return isNaN(n) ? null : n;
    },

    async setLastCheckedBlock(block: number): Promise<void> {
      await db.prepare(
        "INSERT OR REPLACE INTO dvm_meta (key, value) VALUES (?, ?)"
      ).bind(META_LAST_CHECKED_BLOCK, String(block)).run();
    },
  };
}
