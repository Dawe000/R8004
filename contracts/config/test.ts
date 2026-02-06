/**
 * Test configuration - small values for fast, easy testing
 */
export const TEST_CONFIG = {
  COOLDOWN_PERIOD: 60, // 60s instead of 24h
  AGENT_RESPONSE_WINDOW: 120, // 120s instead of 48h
  UMA_LIVENESS: 60, // 60s instead of 2h
  DISPUTE_BOND_BPS: 100, // 1% instead of 10%
  ESCALATION_BOND_BPS: 100, // 1% instead of 10%
  UMA_MINIMUM_BOND: 1n * 10n ** 6n, // 1e6 wei instead of 100 ether
};
