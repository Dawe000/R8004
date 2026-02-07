/**
 * ERC8001 Agent Task SDK
 * TypeScript SDK for client and agent interactions with AgentTaskEscrow
 */

export { ClientSDK } from "./client";
export { AgentSDK } from "./agent";
export type { SDKConfig, IpfsConfig, FirelightSDKConfig } from "./config";
export {
  PLASMA_TESTNET_DEFAULTS,
  COSTON2_FIRELIGHT_DEFAULTS,
  getPlasmaTestnetConfig,
  getCoston2FirelightConfig,
} from "./config";
export type {
  Task,
  TaskStatus,
  TaskMatchRequest,
  TaskMatchResponse,
  RankedAgent,
  AgentCapabilityCard,
} from "./types";
export { calculateResultHash, signTaskResult } from "./crypto";
export {
  uploadJson,
  uploadText,
  uploadFile,
  isLikelyUri,
  fetchFromIpfs,
  fetchClientEvidence,
  fetchAgentEvidence,
  fetchTaskEvidence,
} from "./ipfs";
export { matchAgents } from "./marketmaker";
export { getEscrowContract, getErc20Contract, parseTask, ensureAllowance } from "./contract";
export type { TaskAction, EscrowTimingConfig, EscrowConfig } from "./tasks";
export {
  depositToVault,
  withdrawFromVault,
  redeemFromVault,
  getVaultShareBalance,
  getVaultExchangeRate,
  previewDeposit,
  previewRedeem,
} from "./vault";
export {
  getNextTaskId,
  getTask,
  getTaskDescriptionUri,
  getEscrowConfig,
  getTasksByIdRange,
  getTasksByClient,
  getTasksByAgent,
  getClientIntents,
  getAgentCommitments,
  getClientTasksNeedingAction,
  getAgentTasksNeedingAction,
  isInProgress,
  isContested,
  isResolved,
  isCooldownExpired,
  isDeadlinePassed,
  needsClientDisputeBond,
  needsAgentEscalationBond,
  canClientSettleAgentConceded,
  canAgentSettleNoContest,
  canClientTimeoutCancel,
  getDisputeBondAmount,
  getEscalationBondAmount,
  getClientTaskAction,
  getAgentTaskAction,
} from "./tasks";
