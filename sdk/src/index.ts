/**
 * ERC8001 Agent Task SDK
 * TypeScript SDK for client and agent interactions with AgentTaskEscrow
 */

export { ClientSDK } from "./client";
export { AgentSDK } from "./agent";
export type { SDKConfig, IpfsConfig } from "./config";
export type {
  Task,
  TaskStatus,
  TaskMatchRequest,
  TaskMatchResponse,
  RankedAgent,
  AgentCapabilityCard,
} from "./types";
export { calculateResultHash, signTaskResult } from "./crypto";
export { uploadJson, uploadFile } from "./ipfs";
export { matchAgents } from "./marketmaker";
export { getEscrowContract, getErc20Contract, parseTask, ensureAllowance } from "./contract";
