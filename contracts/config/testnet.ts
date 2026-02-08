/**
 * Testnet configuration - timing tuned for manual testing
 * Quick enough to iterate, long enough to go through flows
 */
export const TESTNET_CONFIG = {
  COOLDOWN_PERIOD: 180, // 3 min - time for client to review before settle
  AGENT_RESPONSE_WINDOW: 300, // 5 min - time for agent to respond to dispute
  UMA_LIVENESS: 180, // 3 min - UMA dispute window
  DISPUTE_BOND_BPS: 100, // 1%
  ESCALATION_BOND_BPS: 100, // 1%
  /** 0.01 USDT in 6 decimals – small enough for testnet path-b-uma-escalate */
  UMA_MINIMUM_BOND: 10_000n, // 1e4
};
