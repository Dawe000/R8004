import {
  Contract,
  ContractTransactionResponse,
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
  "function umaConfig() external view returns (tuple(address oracle, uint64 liveness, bytes32 identifier, uint256 minimumBond))",
  "function createTask(string calldata descriptionURI, address paymentToken, uint256 paymentAmount, uint256 deadline) external returns (uint256 taskId)",
  "function acceptTask(uint256 taskId, uint256 stakeAmount) external",
  "function depositPayment(uint256 taskId) external",
  "function assertCompletion(uint256 taskId, bytes32 resultHash, bytes calldata agentSignature) external",
  "function disputeTask(uint256 taskId, string calldata clientEvidenceURI) external payable",
  "function escalateToUMA(uint256 taskId, string calldata agentEvidenceURI) external payable",
  "function timeoutCancellation(uint256 taskId, string calldata reason) external",
  "function cannotComplete(uint256 taskId, string calldata reason) external",
  "function settleNoContest(uint256 taskId) external",
  "function settleAgentConceded(uint256 taskId) external",
  "function getTask(uint256 taskId) external view returns (tuple(uint256 id, address client, address agent, address paymentToken, uint256 paymentAmount, uint256 agentStake, uint256 createdAt, uint256 deadline, uint256 cooldownEndsAt, uint8 status, bytes32 resultHash, bytes agentSignature, uint256 clientDisputeBond, uint256 agentEscalationBond, string clientEvidenceURI, string agentEvidenceURI, bytes32 umaAssertionId, bool umaResultTruth))",
  "event TaskCreated(uint256 indexed taskId, address indexed client, string descriptionURI)",
  "event TaskAccepted(uint256 indexed taskId, address indexed agent, uint256 stake)",
];

const ERC20_ABI: InterfaceAbi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

/** Escrow contract wrapper */
export function getEscrowContract(
  address: string,
  signerOrProvider: Signer | Provider
): Contract {
  return new Contract(address, ESCROW_ABI, signerOrProvider);
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
  umaAssertionId: string;
  umaResultTruth: boolean;
}): Task {
  return {
    id: raw.id,
    client: raw.client,
    agent: raw.agent,
    paymentToken: raw.paymentToken,
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
    umaAssertionId: raw.umaAssertionId,
    umaResultTruth: raw.umaResultTruth,
  };
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
