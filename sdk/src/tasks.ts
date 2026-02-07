import type { Contract, Provider } from "ethers";
import { getEscrowContract, parseTask } from "./contract.js";
import { TaskStatus } from "./types.js";
import type { Task } from "./types.js";

/** Plasma RPC and many others limit eth_getLogs to 10,000 blocks per query */
const LOG_CHUNK_SIZE = 10_000;

type EventFilter = Parameters<Contract["queryFilter"]>[0];

/** Query filter in 10k-block chunks to respect RPC limits (e.g. Plasma 10k). Returns events from fromBlock to latest. */
async function queryFilterChunked(
  escrow: Contract,
  filter: EventFilter,
  fromBlock: bigint,
  provider: Provider
): Promise<Awaited<ReturnType<Contract["queryFilter"]>>> {
  const block = await provider.getBlockNumber();
  const toBlock = BigInt(block);
  if (fromBlock > toBlock) return [];

  const all: Awaited<ReturnType<Contract["queryFilter"]>> = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + BigInt(LOG_CHUNK_SIZE) - 1n;
    const chunkEnd = end > toBlock ? toBlock : end;
    const events = await escrow.queryFilter(filter, start, chunkEnd);
    all.push(...events);
    start = chunkEnd + 1n;
  }
  return all;
}

/** Next action a role can take on a task */
export type TaskAction =
  | "dispute"
  | "settleAgentConceded"
  | "timeoutCancel"
  | "settleNoContest"
  | "escalateToUMA"
  | "cannotComplete"
  | null;

// --- Status helpers ---

const IN_PROGRESS_STATUSES: TaskStatus[] = [
  TaskStatus.Created,
  TaskStatus.Accepted,
  TaskStatus.ResultAsserted,
  TaskStatus.DisputedAwaitingAgent,
  TaskStatus.EscalatedToUMA,
];

const CONTESTED_STATUSES: TaskStatus[] = [
  TaskStatus.DisputedAwaitingAgent,
  TaskStatus.EscalatedToUMA,
];

const RESOLVED_STATUSES: TaskStatus[] = [
  TaskStatus.TimeoutCancelled,
  TaskStatus.AgentFailed,
  TaskStatus.Resolved,
];

/** True if task is in an active (not terminal) state */
export function isInProgress(task: Task): boolean {
  return IN_PROGRESS_STATUSES.includes(task.status);
}

/** True if task is disputed or escalated to UMA */
export function isContested(task: Task): boolean {
  return CONTESTED_STATUSES.includes(task.status);
}

/** True if task reached a terminal state */
export function isResolved(task: Task): boolean {
  return RESOLVED_STATUSES.includes(task.status);
}

/** True if cooldown has expired (blockTimestamp >= cooldownEndsAt) */
export function isCooldownExpired(
  task: Task,
  blockTimestamp: number | bigint
): boolean {
  return BigInt(blockTimestamp) >= task.cooldownEndsAt;
}

/** True if deadline has passed (blockTimestamp >= deadline) */
export function isDeadlinePassed(
  task: Task,
  blockTimestamp: number | bigint
): boolean {
  return BigInt(blockTimestamp) >= task.deadline;
}

/** ResultAsserted: client can dispute during cooldown (needs bond) */
export function needsClientDisputeBond(task: Task): boolean {
  return task.status === TaskStatus.ResultAsserted;
}

/** DisputedAwaitingAgent: agent needs bond to escalate */
export function needsAgentEscalationBond(task: Task): boolean {
  return task.status === TaskStatus.DisputedAwaitingAgent;
}

/** Client can call settleAgentConceded when agent response window has passed */
export function canClientSettleAgentConceded(
  task: Task,
  blockTimestamp: number | bigint,
  agentResponseWindow: number | bigint
): boolean {
  if (task.status !== TaskStatus.DisputedAwaitingAgent) return false;
  const expiresAt = task.cooldownEndsAt + BigInt(agentResponseWindow);
  return BigInt(blockTimestamp) >= expiresAt;
}

/** Agent can call settleNoContest when cooldown has expired */
export function canAgentSettleNoContest(
  task: Task,
  blockTimestamp: number | bigint
): boolean {
  return (
    task.status === TaskStatus.ResultAsserted &&
    isCooldownExpired(task, blockTimestamp)
  );
}

/** Client can call timeoutCancellation when deadline has passed */
export function canClientTimeoutCancel(
  task: Task,
  blockTimestamp: number | bigint
): boolean {
  return (
    task.status === TaskStatus.Accepted &&
    isDeadlinePassed(task, blockTimestamp)
  );
}

// --- Bond amounts ---

export function getDisputeBondAmount(
  task: Task,
  disputeBondBps: number | bigint
): bigint {
  return (task.paymentAmount * BigInt(disputeBondBps)) / 10000n;
}

export function getEscalationBondAmount(
  task: Task,
  escalationBondBps: number | bigint,
  umaMinBond: bigint
): bigint {
  const computed = (task.paymentAmount * BigInt(escalationBondBps)) / 10000n;
  return computed > umaMinBond ? computed : umaMinBond;
}

// --- Task listing ---

export async function getNextTaskId(
  escrowAddress: string,
  provider: Provider
): Promise<bigint> {
  const escrow = getEscrowContract(escrowAddress, provider);
  return escrow.nextTaskId();
}

export async function getTask(
  escrowAddress: string,
  provider: Provider,
  taskId: bigint
): Promise<Task> {
  const escrow = getEscrowContract(escrowAddress, provider);
  const raw = await escrow.getTask(taskId);
  return parseTask(raw);
}

export async function getTasksByIdRange(
  escrowAddress: string,
  provider: Provider,
  fromId: bigint,
  toId: bigint
): Promise<Task[]> {
  const tasks: Task[] = [];
  for (let i = fromId; i < toId; i++) {
    const task = await getTask(escrowAddress, provider, i);
    if (task.status !== TaskStatus.None) {
      tasks.push(task);
    }
  }
  return tasks;
}

export async function getTasksByClient(
  escrowAddress: string,
  provider: Provider,
  clientAddress: string,
  fromBlock?: number | bigint
): Promise<Task[]> {
  const escrow = getEscrowContract(escrowAddress, provider);
  const filter = escrow.filters.TaskCreated(null, clientAddress);
  const start = fromBlock !== undefined ? BigInt(fromBlock) : 0n;
  const events = await queryFilterChunked(escrow, filter, start, provider);
  const taskIds = [
    ...new Set(
      events.map((e) => ("args" in e && e.args ? (e.args as { taskId?: bigint }).taskId ?? 0n : 0n))
    ),
  ];
  const tasks: Task[] = [];
  for (const id of taskIds) {
    const task = await getTask(escrowAddress, provider, id);
    if (task.status !== TaskStatus.None) tasks.push(task);
  }
  tasks.sort((a, b) => Number(a.id - b.id));
  return tasks;
}

export async function getTasksByAgent(
  escrowAddress: string,
  provider: Provider,
  agentAddress: string,
  fromBlock?: number | bigint
): Promise<Task[]> {
  const escrow = getEscrowContract(escrowAddress, provider);
  const filter = escrow.filters.TaskAccepted(null, agentAddress);
  const start = fromBlock !== undefined ? BigInt(fromBlock) : 0n;
  const events = await queryFilterChunked(escrow, filter, start, provider);
  const taskIds = [
    ...new Set(
      events.map((e) => ("args" in e && e.args ? (e.args as { taskId?: bigint }).taskId ?? 0n : 0n))
    ),
  ];
  const tasks: Task[] = [];
  for (const id of taskIds) {
    const task = await getTask(escrowAddress, provider, id);
    if (task.status !== TaskStatus.None) tasks.push(task);
  }
  tasks.sort((a, b) => Number(a.id - b.id));
  return tasks;
}

/** Fetch task description URI from TaskCreated event. Returns null if no event found. */
export async function getTaskDescriptionUri(
  escrowAddress: string,
  provider: Provider,
  taskId: bigint,
  fromBlock?: number | bigint
): Promise<string | null> {
  const escrow = getEscrowContract(escrowAddress, provider);
  const filter = escrow.filters.TaskCreated(taskId);
  const start = fromBlock !== undefined ? BigInt(fromBlock) : 0n;
  const events = await queryFilterChunked(escrow, filter, start, provider);
  const first = events[0];
  if (!first || !("args" in first) || !first.args) return null;
  const args = first.args as { taskId?: bigint; client?: string; descriptionURI?: string };
  return args.descriptionURI ?? null;
}

/** Escrow timing and bond config */
export interface EscrowConfig {
  cooldownPeriod: bigint;
  agentResponseWindow: bigint;
  disputeBondBps: bigint;
  escalationBondBps: bigint;
  umaConfig: {
    oracle: string;
    liveness: bigint;
    identifier: string;
    minimumBond: bigint;
  };
}

/** Fetch escrow timing and bond parameters in one call. */
export async function getEscrowConfig(
  escrowAddress: string,
  provider: Provider
): Promise<EscrowConfig> {
  const escrow = getEscrowContract(escrowAddress, provider);
  const [cooldownPeriod, agentResponseWindow, disputeBondBps, escalationBondBps, umaConfig] =
    await Promise.all([
      escrow.cooldownPeriod(),
      escrow.agentResponseWindow(),
      escrow.disputeBondBps(),
      escrow.escalationBondBps(),
      escrow.umaConfig(),
    ]);
  return {
    cooldownPeriod,
    agentResponseWindow,
    disputeBondBps,
    escalationBondBps,
    umaConfig: {
      oracle: umaConfig.oracle,
      liveness: umaConfig.liveness,
      identifier: umaConfig.identifier,
      minimumBond: umaConfig.minimumBond,
    },
  };
}

// --- Intent / commitment views ---

export async function getClientIntents(
  escrowAddress: string,
  provider: Provider,
  clientAddress: string,
  inProgressOnly = false,
  fromBlock?: number | bigint
): Promise<Task[]> {
  const tasks = await getTasksByClient(escrowAddress, provider, clientAddress, fromBlock);
  if (inProgressOnly) return tasks.filter(isInProgress);
  return tasks;
}

export async function getAgentCommitments(
  escrowAddress: string,
  provider: Provider,
  agentAddress: string,
  inProgressOnly = false,
  fromBlock?: number | bigint
): Promise<Task[]> {
  const tasks = await getTasksByAgent(escrowAddress, provider, agentAddress, fromBlock);
  if (inProgressOnly) return tasks.filter(isInProgress);
  return tasks;
}

export interface EscrowTimingConfig {
  agentResponseWindow?: bigint | number;
  /** Escrow deployment block - limits eth_getLogs fromBlock on RPCs with 10k block limit */
  fromBlock?: number | bigint;
}

export async function getClientTasksNeedingAction(
  escrowAddress: string,
  provider: Provider,
  clientAddress: string,
  blockTimestamp: number | bigint,
  timingConfig?: EscrowTimingConfig
): Promise<Task[]> {
  const tasks = await getTasksByClient(
    escrowAddress,
    provider,
    clientAddress,
    timingConfig?.fromBlock
  );
  const agentResponseWindow =
    timingConfig?.agentResponseWindow ??
    (await getEscrowContract(escrowAddress, provider).agentResponseWindow());

  return tasks.filter((task) => {
    if (canClientSettleAgentConceded(task, blockTimestamp, agentResponseWindow))
      return true;
    if (canClientTimeoutCancel(task, blockTimestamp)) return true;
    if (needsClientDisputeBond(task) && !isCooldownExpired(task, blockTimestamp))
      return true;
    return false;
  });
}

export async function getAgentTasksNeedingAction(
  escrowAddress: string,
  provider: Provider,
  agentAddress: string,
  blockTimestamp: number | bigint,
  options?: { fromBlock?: number | bigint }
): Promise<Task[]> {
  const tasks = await getTasksByAgent(
    escrowAddress,
    provider,
    agentAddress,
    options?.fromBlock
  );

  return tasks.filter((task) => {
    if (canAgentSettleNoContest(task, blockTimestamp)) return true;
    if (needsAgentEscalationBond(task)) return true;
    return false;
  });
}

/** Infer the next action a client can take on a task */
export function getClientTaskAction(
  task: Task,
  blockTimestamp: number | bigint,
  agentResponseWindow: number | bigint
): TaskAction {
  if (canClientSettleAgentConceded(task, blockTimestamp, agentResponseWindow))
    return "settleAgentConceded";
  if (canClientTimeoutCancel(task, blockTimestamp)) return "timeoutCancel";
  if (needsClientDisputeBond(task) && !isCooldownExpired(task, blockTimestamp))
    return "dispute";
  return null;
}

/** Infer the next action an agent can take on a task */
export function getAgentTaskAction(
  task: Task,
  blockTimestamp: number | bigint
): TaskAction {
  if (canAgentSettleNoContest(task, blockTimestamp)) return "settleNoContest";
  if (needsAgentEscalationBond(task)) return "escalateToUMA";
  if (task.status === TaskStatus.Accepted) return "cannotComplete";
  return null;
}
