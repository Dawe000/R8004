import {
  Contract,
  ContractTransactionResponse,
  Interface,
  type Signer,
  type Provider,
  type InterfaceAbi,
} from "ethers";
import type { Task, TaskStatus } from "./types";

/** Minimal ABI for AgentTaskEscrow - all functions used by SDK */
const ESCROW_ABI: InterfaceAbi = [
  "function nextTaskId() external view returns (uint256)",
  "function cooldownPeriod() external view returns (uint256)",
  "function agentResponseWindow() external view returns (uint256)",
  "function disputeBondBps() external view returns (uint256)",
  "function escalationBondBps() external view returns (uint256)",
  "function paymentDeposited(uint256 taskId) external view returns (bool)",
  "function allowedTokens(address) external view returns (bool)",
  "function umaConfig() external view returns (tuple(address oracle, uint64 liveness, bytes32 identifier, uint256 minimumBond))",
  // Newer escrow signature (with stakeToken)
  "function createTask(string calldata descriptionURI, address paymentToken, uint256 paymentAmount, uint256 deadline, address stakeToken) external returns (uint256 taskId)",
  // Legacy deployed escrow signature (without stakeToken)
  "function createTask(string calldata descriptionURI, address paymentToken, uint256 paymentAmount, uint256 deadline) external returns (uint256 taskId)",
  "function acceptTask(uint256 taskId, uint256 stakeAmount) external",
  "function depositPayment(uint256 taskId) external",
  "function assertCompletion(uint256 taskId, bytes32 resultHash, bytes calldata agentSignature, string calldata resultURI) external",
  "function disputeTask(uint256 taskId, string calldata clientEvidenceURI) external payable",
  "function escalateToUMA(uint256 taskId, string calldata agentEvidenceURI) external payable",
  "function timeoutCancellation(uint256 taskId, string calldata reason) external",
  "function cannotComplete(uint256 taskId, string calldata reason) external",
  "function settleNoContest(uint256 taskId) external",
  "function settleAgentConceded(uint256 taskId) external",
  "function getTask(uint256 taskId) external view returns (tuple(uint256 id, address client, address agent, address paymentToken, address stakeToken, uint256 paymentAmount, uint256 agentStake, uint256 createdAt, uint256 deadline, uint256 cooldownEndsAt, uint8 status, bytes32 resultHash, bytes agentSignature, uint256 clientDisputeBond, uint256 agentEscalationBond, string clientEvidenceURI, string agentEvidenceURI, string resultURI, bytes32 umaAssertionId, bool umaResultTruth))",
  "event TaskCreated(uint256 indexed taskId, address indexed client, string descriptionURI)",
  "event TaskAccepted(uint256 indexed taskId, address indexed agent, uint256 stake)",
  "event TaskDisputeEscalated(uint256 indexed taskId, address indexed agent, uint256 bond, string evidenceURI, bytes32 assertionId)",
];

const ERC20_ABI: InterfaceAbi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const LEGACY_GET_TASK_INTERFACE = new Interface([
  "function getTask(uint256 taskId) external view returns (tuple(uint256 id, address client, address agent, address paymentToken, uint256 paymentAmount, uint256 agentStake, uint256 createdAt, uint256 deadline, uint256 cooldownEndsAt, uint8 status, bytes32 resultHash, bytes agentSignature, uint256 clientDisputeBond, uint256 agentEscalationBond, string clientEvidenceURI, string agentEvidenceURI, string resultURI, bytes32 umaAssertionId, bool umaResultTruth))",
]);
const ALLOWED_TOKENS_PROBE_INTERFACE = new Interface([
  "function allowedTokens(address) external view returns (bool)",
]);
const ESCROW_LAYOUT_CACHE = new Map<string, "legacy" | "modern">();

/** Escrow contract wrapper */
export function getEscrowContract(
  address: string,
  signerOrProvider: Signer | Provider
): Contract {
  return new Contract(address, ESCROW_ABI, signerOrProvider);
}

/**
 * True when an eth_call reverted without revert data.
 * This typically happens when calling a selector that the deployed contract does not implement.
 */
export function isMissingRevertDataCall(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const withCode = error as { code?: string; shortMessage?: string; message?: string; data?: unknown };
  if (withCode.code !== "CALL_EXCEPTION") return false;
  if (withCode.data !== null && withCode.data !== undefined) return false;
  const message = `${withCode.shortMessage ?? ""} ${withCode.message ?? ""}`.toLowerCase();
  return message.includes("missing revert data") || message.includes("execution reverted");
}

/** True for ethers deferred ABI decode errors triggered when reading Result fields lazily. */
export function isDeferredAbiDecodingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const withMessage = error as { shortMessage?: string; message?: string };
  const message = `${withMessage.shortMessage ?? ""} ${withMessage.message ?? ""}`.toLowerCase();
  return message.includes("deferred error during abi decoding");
}

/** Check whether a token is in the escrow's allowed (whitelist) set. Provider-only. */
export async function getTokenAllowed(
  escrowAddress: string,
  provider: Provider,
  tokenAddress: string
): Promise<boolean> {
  const escrow = getEscrowContract(escrowAddress, provider);
  try {
    return await escrow.allowedTokens(tokenAddress);
  } catch (error) {
    if (isMissingRevertDataCall(error)) return true;
    throw error;
  }
}

/** ERC20 contract wrapper */
export function getErc20Contract(
  address: string,
  signerOrProvider: Signer | Provider
): Contract {
  return new Contract(address, ERC20_ABI, signerOrProvider);
}

/** Convert raw task tuple to Task type */
export function parseTask(raw: {
  id: bigint;
  client: string;
  agent: string;
  paymentToken: string;
  stakeToken: string;
  paymentAmount: bigint;
  agentStake: bigint;
  createdAt: bigint;
  deadline: bigint;
  cooldownEndsAt: bigint;
  status: number;
  resultHash: string;
  agentSignature: string;
  clientDisputeBond: bigint;
  agentEscalationBond: bigint;
  clientEvidenceURI: string;
  agentEvidenceURI: string;
  resultURI: string;
  umaAssertionId: string;
  umaResultTruth: boolean;
}): Task {
  return {
    id: raw.id,
    client: raw.client,
    agent: raw.agent,
    paymentToken: raw.paymentToken,
    stakeToken: raw.stakeToken,
    paymentAmount: raw.paymentAmount,
    agentStake: raw.agentStake,
    createdAt: raw.createdAt,
    deadline: raw.deadline,
    cooldownEndsAt: raw.cooldownEndsAt,
    status: raw.status as TaskStatus,
    resultHash: raw.resultHash,
    agentSignature: raw.agentSignature,
    clientDisputeBond: raw.clientDisputeBond,
    agentEscalationBond: raw.agentEscalationBond,
    clientEvidenceURI: raw.clientEvidenceURI,
    agentEvidenceURI: raw.agentEvidenceURI,
    resultURI: raw.resultURI,
    umaAssertionId: raw.umaAssertionId,
    umaResultTruth: raw.umaResultTruth,
  };
}

function parseLegacyTask(raw: {
  id: bigint;
  client: string;
  agent: string;
  paymentToken: string;
  paymentAmount: bigint;
  agentStake: bigint;
  createdAt: bigint;
  deadline: bigint;
  cooldownEndsAt: bigint;
  status: number;
  resultHash: string;
  agentSignature: string;
  clientDisputeBond: bigint;
  agentEscalationBond: bigint;
  clientEvidenceURI: string;
  agentEvidenceURI: string;
  resultURI: string;
  umaAssertionId: string;
  umaResultTruth: boolean;
}): Task {
  return {
    id: raw.id,
    client: raw.client,
    agent: raw.agent,
    paymentToken: raw.paymentToken,
    // Legacy escrow has no dedicated stakeToken field; stake defaults to payment token.
    stakeToken: "0x0000000000000000000000000000000000000000",
    paymentAmount: raw.paymentAmount,
    agentStake: raw.agentStake,
    createdAt: raw.createdAt,
    deadline: raw.deadline,
    cooldownEndsAt: raw.cooldownEndsAt,
    status: raw.status as TaskStatus,
    resultHash: raw.resultHash,
    agentSignature: raw.agentSignature,
    clientDisputeBond: raw.clientDisputeBond,
    agentEscalationBond: raw.agentEscalationBond,
    clientEvidenceURI: raw.clientEvidenceURI,
    agentEvidenceURI: raw.agentEvidenceURI,
    resultURI: raw.resultURI,
    umaAssertionId: raw.umaAssertionId,
    umaResultTruth: raw.umaResultTruth,
  };
}

async function callStatic(
  signerOrProvider: Signer | Provider,
  tx: { to: string; data: string }
): Promise<string> {
  const caller = signerOrProvider as unknown as { call?: (tx: { to: string; data: string }) => Promise<string> };
  if (typeof caller.call !== "function") {
    throw new Error("readTaskCompat: signer/provider does not support call()");
  }
  return caller.call(tx);
}

async function resolveEscrowLayout(
  escrowAddress: string,
  signerOrProvider: Signer | Provider
): Promise<"legacy" | "modern"> {
  const normalized = escrowAddress.toLowerCase();
  const cached = ESCROW_LAYOUT_CACHE.get(normalized);
  if (cached) return cached;

  const probeData = ALLOWED_TOKENS_PROBE_INTERFACE.encodeFunctionData("allowedTokens", [
    "0x0000000000000000000000000000000000000000",
  ]);
  try {
    await callStatic(signerOrProvider, { to: escrowAddress, data: probeData });
    ESCROW_LAYOUT_CACHE.set(normalized, "modern");
    return "modern";
  } catch (error) {
    if (isMissingRevertDataCall(error)) {
      ESCROW_LAYOUT_CACHE.set(normalized, "legacy");
      return "legacy";
    }
    // Fallback to modern path for unexpected probe errors.
    ESCROW_LAYOUT_CACHE.set(normalized, "modern");
    return "modern";
  }
}

/**
 * Read task with backward compatibility:
 * 1) Try current ABI decode (with stakeToken).
 * 2) On deferred ABI decode error, raw-call and decode legacy tuple (without stakeToken).
 */
export async function readTaskCompat(
  escrowAddress: string,
  signerOrProvider: Signer | Provider,
  taskId: bigint
): Promise<Task> {
  const layout = await resolveEscrowLayout(escrowAddress, signerOrProvider);
  if (layout === "legacy") {
    const data = LEGACY_GET_TASK_INTERFACE.encodeFunctionData("getTask", [taskId]);
    const rawResult = await callStatic(signerOrProvider, { to: escrowAddress, data });
    const decoded = LEGACY_GET_TASK_INTERFACE.decodeFunctionResult("getTask", rawResult)[0] as {
      id: bigint;
      client: string;
      agent: string;
      paymentToken: string;
      paymentAmount: bigint;
      agentStake: bigint;
      createdAt: bigint;
      deadline: bigint;
      cooldownEndsAt: bigint;
      status: number;
      resultHash: string;
      agentSignature: string;
      clientDisputeBond: bigint;
      agentEscalationBond: bigint;
      clientEvidenceURI: string;
      agentEvidenceURI: string;
      resultURI: string;
      umaAssertionId: string;
      umaResultTruth: boolean;
    };
    return parseLegacyTask(decoded);
  }

  const escrow = getEscrowContract(escrowAddress, signerOrProvider);
  try {
    const raw = await escrow.getTask(taskId);
    return parseTask(raw);
  } catch (error) {
    if (!isDeferredAbiDecodingError(error)) throw error;
  }

  const data = LEGACY_GET_TASK_INTERFACE.encodeFunctionData("getTask", [taskId]);
  const rawResult = await callStatic(signerOrProvider, { to: escrowAddress, data });
  const decoded = LEGACY_GET_TASK_INTERFACE.decodeFunctionResult("getTask", rawResult)[0] as {
    id: bigint;
    client: string;
    agent: string;
    paymentToken: string;
    paymentAmount: bigint;
    agentStake: bigint;
    createdAt: bigint;
    deadline: bigint;
    cooldownEndsAt: bigint;
    status: number;
    resultHash: string;
    agentSignature: string;
    clientDisputeBond: bigint;
    agentEscalationBond: bigint;
    clientEvidenceURI: string;
    agentEvidenceURI: string;
    resultURI: string;
    umaAssertionId: string;
    umaResultTruth: boolean;
  };
  return parseLegacyTask(decoded);
}

/** Ensure allowance for spender - approves if needed, waits for confirmation */
export async function ensureAllowance(
  tokenAddress: string,
  owner: Signer,
  spender: string,
  amount: bigint
): Promise<ContractTransactionResponse | null> {
  const token = getErc20Contract(tokenAddress, owner);
  const ownerAddress = await owner.getAddress();
  const current = await token.allowance(ownerAddress, spender);
  if (current >= amount) return null;
  const tx = await token.approve(spender, amount);
  await tx.wait();
  return tx;
}
