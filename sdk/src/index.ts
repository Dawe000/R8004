/**
 * ERC8001 Agent Task SDK
 * TypeScript SDK for client and agent interactions with AgentTaskEscrow
 */

export { ClientSDK } from "./client.js";
export { AgentSDK } from "./agent.js";
export type { SDKConfig, IpfsConfig } from "./config.js";
export {
  PLASMA_TESTNET_DEFAULTS,
  getPlasmaTestnetConfig,
} from "./config.js";
export type {
  Task,
  TaskStatus,
  TaskMatchRequest,
  TaskMatchResponse,
  RankedAgent,
  AgentCapabilityCard,
} from "./types.js";
export { calculateResultHash, signTaskResult } from "./crypto.js";
export {
  uploadJson,
  uploadFile,
  fetchFromIpfs,
  fetchClientEvidence,
  fetchAgentEvidence,
  fetchTaskEvidence,
} from "./ipfs.js";
export { matchAgents } from "./marketmaker.js";
export { getEscrowContract, getErc20Contract, parseTask, ensureAllowance } from "./contract.js";
export type { TaskAction, EscrowTimingConfig, EscrowConfig } from "./tasks.js";
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
} from "./tasks.js";
