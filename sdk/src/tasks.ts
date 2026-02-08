import type { Contract, Provider } from "ethers";
import { getEscrowContract, readTaskCompat } from "./contract";
import { TaskStatus } from "./types";
import type { Task } from "./types";

/** Plasma RPC and many others limit eth_getLogs to 10,000 blocks per query */
const LOG_CHUNK_SIZE = 10_000;
const MIN_LOG_CHUNK_SIZE = 1n;

type EventFilter = Parameters<Contract["queryFilter"]>[0];

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    let msg = error.message;
    // Unwrap ethers "could not coalesce error (error={ ... })" so we see the RPC message
    const nested = msg.match(/error=\{\s*"message":\s*"([^"]+)"/);
    if (nested?.[1]) msg += " " + nested[1];
    const info = error as { info?: { error?: { message?: string } } };
    if (info?.info?.error?.message) msg += " " + info.info.error.message;
    return msg;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isLogRangeLimitError(error: unknown): boolean {
  const message = stringifyError(error).toLowerCase();
  return (
    message.includes("requested too many blocks") ||
    message.includes("maximum is set to") ||
    message.includes("max block range") ||
    message.includes("query exceeds") ||
    message.includes("block range")
  );
}

function extractMaxRangeFromError(error: unknown): bigint | null {
  const message = stringifyError(error);
  const match = message.match(/maximum\s+is\s+set\s+to\s+(\d+)/i);
  if (!match) return null;
  try {
    const parsed = BigInt(match[1]);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/** Query filter in chunks to respect RPC limits. Returns events from fromBlock to latest. */
async function queryFilterChunked(
  escrow: Contract,
  filter: EventFilter,
  fromBlock: bigint,
  provider: Provider,
  /** When set (e.g. 30 for Flare), use this as initial chunk size to avoid a rejected first request */
  maxChunkSize?: number
): Promise<Awaited<ReturnType<Contract["queryFilter"]>>> {
  const block = await provider.getBlockNumber();
  const toBlock = BigInt(block);
  if (fromBlock > toBlock) return [];

  const all: Awaited<ReturnType<Contract["queryFilter"]>> = [];
  let start = fromBlock;
  let chunkSize = maxChunkSize != null ? BigInt(maxChunkSize) : BigInt(LOG_CHUNK_SIZE);
  const hardCap = maxChunkSize != null ? BigInt(maxChunkSize) : null;
  while (start <= toBlock) {
    const effectiveSize = hardCap != null && chunkSize > hardCap ? hardCap : chunkSize;
    const end = start + effectiveSize - 1n;
    const chunkEnd = end > toBlock ? toBlock : end;
    try {
      const events = await escrow.queryFilter(filter, start, chunkEnd);
      all.push(...events);
      start = chunkEnd + 1n;
    } catch (error) {
      if (!isLogRangeLimitError(error)) {
        throw error;
      }

      const maxRange = extractMaxRangeFromError(error);
      let nextChunkSize = maxRange ?? chunkSize / 2n;
      if (nextChunkSize >= chunkSize) {
        nextChunkSize = chunkSize - 1n;
      }
      if (hardCap != null && nextChunkSize > hardCap) {
        nextChunkSize = hardCap;
      }

      if (nextChunkSize < MIN_LOG_CHUNK_SIZE || chunkSize <= MIN_LOG_CHUNK_SIZE) {
        throw error;
      }

      chunkSize = nextChunkSize;
    }
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
  return readTaskCompat(escrowAddress, provider, taskId);
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

/** Escalated dispute info from TaskDisputeEscalated event */
export interface EscalatedDispute {
  taskId: bigint;
  assertionId: string;
  blockNumber: number;
}

/** Options for getEscalatedDisputes */
export interface GetEscalatedDisputesOptions {
  /** Max blocks per eth_getLogs chunk (e.g. 30 for Flare Coston2). If omitted, uses 10k then retries on error. */
  maxBlockRange?: number;
}

/** Fetch escalated disputes from TaskDisputeEscalated events (fromBlock to toBlock). Event-based - 1-2 eth_getLogs instead of O(nextTaskId) getTask calls. */
export async function getEscalatedDisputes(
  escrowAddress: string,
  provider: Provider,
  fromBlock: number | bigint,
  toBlock?: number | bigint,
  options?: GetEscalatedDisputesOptions
): Promise<EscalatedDispute[]> {
  const escrow = getEscrowContract(escrowAddress, provider);
  const filter = escrow.filters.TaskDisputeEscalated?.();
  if (!filter) return [];
  const start = BigInt(fromBlock);
  const end =
    toBlock !== undefined
      ? BigInt(toBlock)
      : BigInt(await provider.getBlockNumber());
  if (start > end) return [];
  const events = await queryFilterChunked(
    escrow,
    filter,
    start,
    provider,
    options?.maxBlockRange
  );
  return events
    .filter((e): e is typeof e & { blockNumber: number } => e.blockNumber != null && BigInt(e.blockNumber) <= end)
    .map((e) => {
      const args = ("args" in e && e.args) as
        | { taskId?: bigint; assertionId?: string }
        | undefined;
      return {
        taskId: args?.taskId ?? 0n,
        assertionId: args?.assertionId ?? "0x",
        blockNumber: e.blockNumber,
      };
    })
    .filter((d) => d.taskId !== 0n && d.assertionId !== "0x");
}

/** Fetch block number when task was escalated to UMA. Returns null if no TaskDisputeEscalated event. */
export async function getEscalationBlockForTask(
  escrowAddress: string,
  provider: Provider,
  taskId: bigint,
  fromBlock?: number | bigint
): Promise<number | null> {
  const escrow = getEscrowContract(escrowAddress, provider);
  const filter = escrow.filters.TaskDisputeEscalated?.(taskId);
  if (!filter) return null;
  const start = fromBlock !== undefined ? BigInt(fromBlock) : 0n;
  const events = await queryFilterChunked(escrow, filter, start, provider);
  const first = events[0];
  if (!first || !first.blockNumber) return null;
  return first.blockNumber;
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
