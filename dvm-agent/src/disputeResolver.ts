/**
 * Core dispute resolution logic: fetch escalated disputes, Venice decide, pushResolution.
 */

import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { Task } from "@erc8001/agent-task-sdk";
import {
  getNextTaskId,
  getTasksByIdRange,
  getTaskDescriptionUri,
  getEscalationBlockForTask,
  getEscrowConfig,
  fetchFromIpfs,
  fetchTaskEvidence,
  TaskStatus,
  PLASMA_TESTNET_DEFAULTS,
} from "@erc8001/agent-task-sdk";
import { VeniceDisputeService } from "./services/veniceDispute";
import type { D1State } from "./db";

const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const PLASMA_BLOCK_TIME_SEC = 2;

/** MockOOv3 ABI - settled and pushResolution */
const MOCK_OO_ABI = [
  "function settled(bytes32) external view returns (bool)",
  "function pushResolution(bytes32 assertionId, bool assertedTruthfully) external",
];

export interface DvmEnv {
  VENICE_API_KEY: string;
  DVM_PRIVATE_KEY: string;
  RPC_URL: string;
  ESCROW_ADDRESS: string;
  MOCK_OOv3_ADDRESS: string;
  DEPLOYMENT_BLOCK?: number;
}

export interface ResolveResult {
  taskId: bigint;
  assertionId: string;
  winner: "agent" | "client";
  resolved: boolean;
  skipped?: string;
  error?: string;
}

export async function resolvePendingDisputes(
  env: DvmEnv,
  dvmState: D1State
): Promise<ResolveResult[]> {
  const provider = new JsonRpcProvider(env.RPC_URL);
  const wallet = new Wallet(env.DVM_PRIVATE_KEY, provider);
  const escrowAddress = env.ESCROW_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.escrowAddress;
  const mockOOAddress = env.MOCK_OOv3_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.mockOOv3Address;
  const deploymentBlock = env.DEPLOYMENT_BLOCK ?? Number(PLASMA_TESTNET_DEFAULTS.deploymentBlock);

  const [escrowConfig, nextTaskId] = await Promise.all([
    getEscrowConfig(escrowAddress, provider),
    getNextTaskId(escrowAddress, provider),
  ]);

  const tasks = await getTasksByIdRange(escrowAddress, provider, 0n, nextTaskId);
  const escalated = tasks.filter(
    (t) => Number(t.status) === TaskStatus.EscalatedToUMA
  );

  const mockOO = new Contract(mockOOAddress, MOCK_OO_ABI, provider);
  const mockOOSigner = new Contract(mockOOAddress, MOCK_OO_ABI, wallet);
  const venice = new VeniceDisputeService(env.VENICE_API_KEY);

  const results: ResolveResult[] = [];
  const currentBlock = await provider.getBlockNumber();
  const livenessBlocks = Number(escrowConfig.umaConfig.liveness) / PLASMA_BLOCK_TIME_SEC;

  for (const task of escalated) {
    const assertionId = task.umaAssertionId;
    if (!assertionId || assertionId === "0x" + "0".repeat(64)) {
      results.push({
        taskId: task.id,
        assertionId: assertionId ?? "0x",
        winner: "client",
        resolved: false,
        skipped: "no assertionId",
      });
      continue;
    }

    const alreadySettled = await mockOO.settled(assertionId);
    if (alreadySettled) {
      results.push({
        taskId: task.id,
        assertionId,
        winner: "client",
        resolved: false,
        skipped: "already settled",
      });
      continue;
    }

    const alreadyProcessed = await dvmState.isProcessed(assertionId);
    if (alreadyProcessed) {
      results.push({
        taskId: task.id,
        assertionId,
        winner: "client",
        resolved: false,
        skipped: "already processed",
      });
      continue;
    }

    const escalationBlock = await getEscalationBlockForTask(
      escrowAddress,
      provider,
      task.id,
      deploymentBlock
    );
    if (escalationBlock === null) {
      results.push({
        taskId: task.id,
        assertionId,
        winner: "client",
        resolved: false,
        skipped: "no escalation block",
      });
      continue;
    }

    const blocksSinceEscalation = currentBlock - escalationBlock;
    if (blocksSinceEscalation < livenessBlocks) {
      results.push({
        taskId: task.id,
        assertionId,
        winner: "client",
        resolved: false,
        skipped: `liveness not met (${blocksSinceEscalation} < ${livenessBlocks} blocks)`,
      });
      continue;
    }

    try {
      const evidence = await fetchEvidence(task, escrowAddress, provider, deploymentBlock);
      const veniceResult = await venice.decideDispute(evidence);
      const agentWins = veniceResult.winner === "agent";

      const tx = await mockOOSigner.pushResolution(assertionId, agentWins);
      await tx.wait();

      await dvmState.markProcessed(assertionId);

      results.push({
        taskId: task.id,
        assertionId,
        winner: veniceResult.winner,
        resolved: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        taskId: task.id,
        assertionId,
        winner: "client",
        resolved: false,
        error: msg,
      });
    }
  }

  await dvmState.setLastCheckedBlock(currentBlock);
  return results;
}

async function fetchEvidence(
  task: Task,
  escrowAddress: string,
  provider: JsonRpcProvider,
  deploymentBlock: number
): Promise<{ taskDescription: string; clientEvidence: string; agentEvidence: string; agentResult: string }> {
  const opts = { gateway: DEFAULT_IPFS_GATEWAY };

  const [taskDescUri, clientAgent] = await Promise.all([
    getTaskDescriptionUri(escrowAddress, provider, task.id, deploymentBlock),
    fetchTaskEvidence(task, opts),
  ]);

  let taskDescription = "(no description URI)";
  if (taskDescUri?.trim()) {
    try {
      const text = await fetchFromIpfs(taskDescUri, { ...opts, asJson: false });
      taskDescription = typeof text === "string" ? text : JSON.stringify(text);
    } catch {
      taskDescription = `(failed to fetch: ${taskDescUri})`;
    }
  }

  let clientEvidence = "(none)";
  if (clientAgent.clientEvidence !== undefined && clientAgent.clientEvidence !== null) {
    clientEvidence =
      typeof clientAgent.clientEvidence === "string"
        ? clientAgent.clientEvidence
        : JSON.stringify(clientAgent.clientEvidence);
  } else if (task.clientEvidenceURI?.trim()) {
    try {
      const text = await fetchFromIpfs(task.clientEvidenceURI, { ...opts, asJson: false });
      clientEvidence = typeof text === "string" ? text : JSON.stringify(text);
    } catch {
      clientEvidence = `(failed to fetch: ${task.clientEvidenceURI})`;
    }
  }

  let agentEvidence = "(none)";
  if (clientAgent.agentEvidence !== undefined && clientAgent.agentEvidence !== null) {
    agentEvidence =
      typeof clientAgent.agentEvidence === "string"
        ? clientAgent.agentEvidence
        : JSON.stringify(clientAgent.agentEvidence);
  } else if (task.agentEvidenceURI?.trim()) {
    try {
      const text = await fetchFromIpfs(task.agentEvidenceURI, { ...opts, asJson: false });
      agentEvidence = typeof text === "string" ? text : JSON.stringify(text);
    } catch {
      agentEvidence = `(failed to fetch: ${task.agentEvidenceURI})`;
    }
  }

  let agentResult = "(none)";
  if (task.resultURI?.trim()) {
    try {
      const text = await fetchFromIpfs(task.resultURI, { ...opts, asJson: false });
      agentResult = typeof text === "string" ? text : JSON.stringify(text);
    } catch {
      agentResult = `(failed to fetch: ${task.resultURI})`;
    }
  }

  return {
    taskDescription,
    clientEvidence,
    agentEvidence,
    agentResult,
  };
}
