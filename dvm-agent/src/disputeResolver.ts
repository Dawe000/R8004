/**
 * Core dispute resolution logic: fetch escalated disputes, Venice decide, pushResolution.
 */

import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { Task } from "@erc8001/agent-task-sdk";
import {
  getEscalatedDisputes,
  getTask,
  getTaskDescriptionUri,
  getEscrowConfig,
  fetchFromIpfs,
  PLASMA_TESTNET_DEFAULTS,
} from "@erc8001/agent-task-sdk";
import { VeniceDisputeService } from "./services/veniceDispute";
import type { D1State } from "./db";

/** Cloudflare gateway – more reliable than ipfs.io from Workers (fewer SSL drops) */
const DEFAULT_IPFS_GATEWAY = "https://cloudflare-ipfs.com/ipfs/";
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
  /** Override IPFS gateway (default: Cloudflare, or Pinata when PINATA_JWT set). */
  IPFS_GATEWAY?: string;
  /** When set, use Pinata gateway (more reliable for content pinned via Pinata). */
  PINATA_JWT?: string;
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

  const currentBlock = await provider.getBlockNumber();
  const lastChecked = await dvmState.getLastCheckedBlock();
  const fromBlock = lastChecked ?? deploymentBlock;

  const [escrowConfig, escalated] = await Promise.all([
    getEscrowConfig(escrowAddress, provider),
    getEscalatedDisputes(escrowAddress, provider, fromBlock, currentBlock),
  ]);

  console.log("[DVM] blocks", fromBlock, "→", currentBlock, "| disputes:", escalated.length);

  const ipfsGateway =
    env.IPFS_GATEWAY ??
    (env.PINATA_JWT ? "https://gateway.pinata.cloud/ipfs/" : DEFAULT_IPFS_GATEWAY);
  const mockOO = new Contract(mockOOAddress, MOCK_OO_ABI, provider);
  const mockOOSigner = new Contract(mockOOAddress, MOCK_OO_ABI, wallet);
  const venice = new VeniceDisputeService(env.VENICE_API_KEY);

  const results: ResolveResult[] = [];
  const livenessBlocks = Number(escrowConfig.umaConfig.liveness) / PLASMA_BLOCK_TIME_SEC;

  for (const dispute of escalated) {
    const { taskId, assertionId, blockNumber: escalationBlock } = dispute;
    if (!assertionId || assertionId === "0x" + "0".repeat(64)) {
      console.log("[DVM] task", taskId.toString(), "skipped: no assertionId");
      results.push({
        taskId,
        assertionId: assertionId ?? "0x",
        winner: "client",
        resolved: false,
        skipped: "no assertionId",
      });
      continue;
    }

    const alreadySettled = await mockOO.settled(assertionId);
    if (alreadySettled) {
      console.log("[DVM] task", taskId.toString(), "skipped: already settled");
      results.push({
        taskId,
        assertionId,
        winner: "client",
        resolved: false,
        skipped: "already settled",
      });
      continue;
    }

    const alreadyProcessed = await dvmState.isProcessed(assertionId);
    if (alreadyProcessed) {
      console.log("[DVM] task", taskId.toString(), "skipped: already processed");
      results.push({
        taskId,
        assertionId,
        winner: "client",
        resolved: false,
        skipped: "already processed",
      });
      continue;
    }

    const blocksSinceEscalation = currentBlock - escalationBlock;
    if (blocksSinceEscalation < livenessBlocks) {
      console.log(
        "[DVM] task",
        taskId.toString(),
        "skipped: liveness not met",
        blocksSinceEscalation,
        "<",
        livenessBlocks,
        "blocks"
      );
      results.push({
        taskId,
        assertionId,
        winner: "client",
        resolved: false,
        skipped: `liveness not met (${blocksSinceEscalation} < ${livenessBlocks} blocks)`,
      });
      continue;
    }

    let task: Task;
    try {
      task = await getTask(escrowAddress, provider, taskId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[DVM] task", taskId.toString(), "getTask failed:", msg);
      results.push({
        taskId,
        assertionId,
        winner: "client",
        resolved: false,
        error: `getTask: ${msg}`,
      });
      continue;
    }

    try {
      console.log("[DVM] task", taskId.toString(), "fetching evidence...");
      const evidence = await fetchEvidence(task, escrowAddress, provider, deploymentBlock, ipfsGateway);
      console.log("[DVM] task", taskId.toString(), "calling Venice...");
      const veniceResult = await venice.decideDispute(evidence);
      const agentWins = veniceResult.winner === "agent";
      console.log("[DVM] task", taskId.toString(), "Venice:", veniceResult.winner, "pushing tx...");

      const tx = await mockOOSigner.pushResolution(assertionId, agentWins);
      await tx.wait();
      console.log("[DVM] task", taskId.toString(), "tx confirmed, marking processed");

      await dvmState.markProcessed(assertionId);

      results.push({
        taskId,
        assertionId,
        winner: veniceResult.winner,
        resolved: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[DVM] task", taskId.toString(), "failed:", msg);
      if (err instanceof Error && err.cause) {
        console.error("[DVM] cause:", err.cause);
      }
      results.push({
        taskId,
        assertionId,
        winner: "client",
        resolved: false,
        error: msg,
      });
    }
    // Delay between disputes to reduce gateway rate limits (429)
    if (escalated.indexOf(dispute) < escalated.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Only advance lastCheckedBlock when all disputes were terminal (resolved or permanently skipped).
  // Otherwise we'd never retry disputes we failed on (evidence, Venice, tx) or skipped for liveness.
  const allTerminal = results.every(
    (r) =>
      r.resolved ||
      r.skipped === "already settled" ||
      r.skipped === "already processed" ||
      r.skipped === "no assertionId"
  );
  if (allTerminal) {
    await dvmState.setLastCheckedBlock(currentBlock);
  } else {
    console.log("[DVM] not advancing lastCheckedBlock – some disputes need retry");
  }
  return results;
}

const IPFS_RETRIES = 3;
const IPFS_RETRY_DELAY_MS = 2000;
/** Longer delay for 429 (rate limit) – give gateway time to reset */
const IPFS_RETRY_DELAY_429_MS = 10000;

/** 4xx = bad link / no content – don't retry, treat as no evidence */
function isPermanentFailure(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /fetchFromIpfs: 4\d\d|400 Bad Request|404 Not Found/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < IPFS_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const cause = e instanceof Error && e.cause ? ` cause=${e.cause}` : "";
      if (isPermanentFailure(e)) {
        console.warn("[DVM]", label, "permanent failure (bad link / no content):", msg, "– treating as none");
        throw e;
      }
      if (i < IPFS_RETRIES - 1) {
        const is429 = /429|Too Many Requests/i.test(msg);
        const delay = is429 ? IPFS_RETRY_DELAY_429_MS : IPFS_RETRY_DELAY_MS;
        console.log("[DVM]", label, "failed:", msg, cause, "– retry", i + 1, "/", IPFS_RETRIES, `(wait ${delay / 1000}s)`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error("[DVM]", label, "failed after", IPFS_RETRIES, "attempts:", msg, cause);
      }
    }
  }
  throw lastErr;
}

function resolveGatewayUrl(uri: string, gateway: string): string {
  const u = uri.trim();
  if (!u) return "";
  if (u.startsWith("ipfs://")) return `${gateway.replace(/\/$/, "")}/${u.slice(7)}`;
  if (u.includes("/ipfs/")) return u;
  return `${gateway.replace(/\/$/, "")}/${u}`;
}

async function fetchEvidence(
  task: Task,
  escrowAddress: string,
  provider: JsonRpcProvider,
  deploymentBlock: number,
  ipfsGateway: string
): Promise<{ taskDescription: string; clientEvidence: string; agentEvidence: string; agentResult: string }> {
  const opts = { gateway: ipfsGateway };

  console.log("[DVM] fetchEvidence: gateway=", ipfsGateway);
  console.log("[DVM] fetchEvidence: task URIs:", {
    client: task.clientEvidenceURI ?? "(none)",
    agent: task.agentEvidenceURI ?? "(none)",
    result: task.resultURI ?? "(none)",
  });

  console.log("[DVM] fetchEvidence: getTaskDescriptionUri (RPC)...");
  const taskDescUri = await getTaskDescriptionUri(escrowAddress, provider, task.id, deploymentBlock);
  console.log("[DVM] fetchEvidence: taskDescUri:", taskDescUri ?? null);

  // Fetch client/agent evidence; on IPFS failure treat as no evidence (continue to Venice)
  const clientAgent: { clientEvidence?: string | unknown; agentEvidence?: string | unknown } = {};
  if (task.clientEvidenceURI?.trim()) {
    const uri = task.clientEvidenceURI;
    const url = resolveGatewayUrl(uri, ipfsGateway);
    console.log("[DVM] fetchEvidence: fetching clientEvidence", url);
    try {
      clientAgent.clientEvidence = await withRetry(
        () => fetchFromIpfs(uri, { ...opts, asJson: false }),
        "clientEvidence"
      );
    } catch (e) {
      console.warn("[DVM] clientEvidence IPFS failed – treating as none");
    }
  }
  if (task.agentEvidenceURI?.trim()) {
    const uri = task.agentEvidenceURI;
    const url = resolveGatewayUrl(uri, ipfsGateway);
    console.log("[DVM] fetchEvidence: fetching agentEvidence", url);
    try {
      clientAgent.agentEvidence = await withRetry(
        () => fetchFromIpfs(uri, { ...opts, asJson: false }),
        "agentEvidence"
      );
    } catch (e) {
      console.warn("[DVM] agentEvidence IPFS failed – treating as none");
    }
  }

  let taskDescription = "(no description URI)";
  if (taskDescUri?.trim()) {
    try {
      console.log("[DVM] fetchEvidence: IPFS taskDesc:", taskDescUri);
      const text = await withRetry(
        () => fetchFromIpfs(taskDescUri!, { ...opts, asJson: false }),
        "taskDesc"
      );
      taskDescription = typeof text === "string" ? text : JSON.stringify(text);
    } catch (e) {
      console.warn("[DVM] taskDesc IPFS failed – treating as none");
      taskDescription = "(IPFS unavailable)";
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
      const text = await withRetry(
        () => fetchFromIpfs(task.clientEvidenceURI!, { ...opts, asJson: false }),
        "clientEvidence"
      );
      clientEvidence = typeof text === "string" ? text : JSON.stringify(text);
    } catch {
      console.warn("[DVM] clientEvidence IPFS failed – treating as none");
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
      const text = await withRetry(
        () => fetchFromIpfs(task.agentEvidenceURI!, { ...opts, asJson: false }),
        "agentEvidence"
      );
      agentEvidence = typeof text === "string" ? text : JSON.stringify(text);
    } catch {
      console.warn("[DVM] agentEvidence IPFS failed – treating as none");
    }
  }

  let agentResult = "(none)";
  if (task.resultURI?.trim()) {
    try {
      const text = await withRetry(
        () => fetchFromIpfs(task.resultURI!, { ...opts, asJson: false }),
        "resultURI"
      );
      agentResult = typeof text === "string" ? text : JSON.stringify(text);
    } catch {
      console.warn("[DVM] resultURI IPFS failed – treating as none");
    }
  }

  console.log("[DVM] fetchEvidence: done");
  return {
    taskDescription,
    clientEvidence,
    agentEvidence,
    agentResult,
  };
}
