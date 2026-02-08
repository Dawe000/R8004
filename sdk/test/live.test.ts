/**
 * Live tests - run against Plasma testnet (chainId 9746).
 *
 * Setup:
 * 1. Set SDK_LIVE_TESTNET=1 and MNEMONIC in env (or in .env)
 * 2. Ensure client/agent addresses are funded (XPL for gas + USDT0 for payments/stake)
 *
 * Loads .env from sdk/ or ../contracts/ if present.
 * Skip unless SDK_LIVE_TESTNET=1 and MNEMONIC are set.
 * Optional: SDK_LIVE_RUN_FLOW=path-a,path-c,path-d to run flows (creates tasks, costs tokens).
 *   path-a | path-c | path-d | path-b-concede | path-b-uma-agent | path-b-uma-client
 *
 * Bonds (same token as task payment, i.e. USDT0 on Plasma):
 * - Client dispute bond = 1% of paymentAmount (disputeBondBps).
 * - Agent escalation bond = max(1% of paymentAmount, umaConfig.minimumBond). Testnet minimumBond = 1e18 (1 token, 18 decimals).
 * Flow amounts are kept tiny (below a cent) to minimise cost.
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();
if (!process.env.MNEMONIC) {
  const contractsEnv = path.join(process.cwd(), "..", "contracts", ".env");
  if (fs.existsSync(contractsEnv)) dotenv.config({ path: contractsEnv });
}
import { ethers } from "ethers";
import {
  ClientSDK,
  AgentSDK,
  getPlasmaTestnetConfig,
  getNextTaskId,
  getTask,
  getTaskDescriptionUri,
  getEscrowConfig,
  getTasksByClient,
  getTasksByAgent,
  isInProgress,
  isContested,
  isResolved,
  fetchFromIpfs,
  fetchTaskEvidence,
} from "../src/index.js";
import { TaskStatus } from "../src/types.js";

const MNEMONIC = process.env.MNEMONIC;
const SDK_LIVE_TESTNET = process.env.SDK_LIVE_TESTNET === "1";
const FLOW_ENV = process.env.SDK_LIVE_RUN_FLOW ?? "";
const FLOW_SET = new Set(FLOW_ENV.split(",").map((s) => s.trim()).filter(Boolean));

function runFlow(name: string): boolean {
  return !!MNEMONIC?.trim() && (FLOW_SET.has(name) || (name === "path-a" && FLOW_SET.has("1")));
}

function getSigner(index: number): ethers.Wallet {
  const cfg = getPlasmaTestnetConfig();
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const m = ethers.Mnemonic.fromPhrase(MNEMONIC!.trim());
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed());
  const derived = root.derivePath(`m/44'/60'/0'/0/${index}`);
  return derived.connect(provider);
}

const describeLive =
  SDK_LIVE_TESTNET && MNEMONIC?.trim() ? describe : describe.skip;

describeLive("SDK live (Plasma testnet)", () => {
  let client: ethers.Wallet;
  let agent: ethers.Wallet;
  let clientSdk: ClientSDK;
  let agentSdk: AgentSDK;
  let config: ReturnType<typeof getPlasmaTestnetConfig>;

  beforeAll(() => {
    config = getLiveConfig();
    client = getSigner(1);
    agent = getSigner(2);
    clientSdk = new ClientSDK(config, client);
    agentSdk = new AgentSDK(config, agent);
  });

  it("getNextTaskId returns a number", async () => {
    const nextId = await getNextTaskId(config.escrowAddress, client.provider!);
    expect(typeof nextId).toBe("bigint");
    expect(nextId >= 0n).toBe(true);
  });

  it("getTask fetches existing task when taskId < nextTaskId", async () => {
    const nextId = await getNextTaskId(config.escrowAddress, client.provider!);
    if (nextId === 0n) {
      expect(await getTasksByClient(config.escrowAddress, client.provider!, client.address, config.deploymentBlock)).toEqual([]);
      return;
    }
    const task = await getTask(config.escrowAddress, client.provider!, 0n);
    expect(task).toBeDefined();
    expect(task.id).toBe(0n);
    expect(task.status).toBeDefined();
    expect(typeof task.client).toBe("string");
    expect(typeof task.agent).toBe("string");
  }, 15000);

  it("getTasksByClient returns tasks created by client", async () => {
    const tasks = await getTasksByClient(
      config.escrowAddress,
      client.provider!,
      client.address,
      config.deploymentBlock
    );
    expect(Array.isArray(tasks)).toBe(true);
    for (const t of tasks) {
      expect(t.client.toLowerCase()).toBe(client.address.toLowerCase());
    }
  });

  it("getTasksByAgent returns tasks accepted by agent", async () => {
    const tasks = await getTasksByAgent(
      config.escrowAddress,
      agent.provider!,
      agent.address,
      config.deploymentBlock
    );
    expect(Array.isArray(tasks)).toBe(true);
    for (const t of tasks) {
      expect(t.agent.toLowerCase()).toBe(agent.address.toLowerCase());
    }
  });

  it("clientSdk.getMyTasks and agentSdk.getMyTasks work", async () => {
    const clientTasks = await clientSdk.getMyTasks();
    const agentTasks = await agentSdk.getMyTasks();
    expect(Array.isArray(clientTasks)).toBe(true);
    expect(Array.isArray(agentTasks)).toBe(true);
  });

  it("status helpers work on a task", async () => {
    const nextId = await getNextTaskId(config.escrowAddress, client.provider!);
    if (nextId === 0n) return;
    const task = await getTask(config.escrowAddress, client.provider!, 0n);
    expect(task.status).toBeDefined();
    expect(Number(task.status) >= 0 && Number(task.status) <= 8).toBe(true);
    if (task.status === TaskStatus.Resolved) {
      expect(isResolved(task)).toBe(true);
    }
  });

  it("getTasksNeedingAction returns array", async () => {
    const clientActions = await clientSdk.getTasksNeedingAction();
    const agentActions = await agentSdk.getTasksNeedingAction();
    expect(Array.isArray(clientActions)).toBe(true);
    expect(Array.isArray(agentActions)).toBe(true);
  });

  it("getTaskDescriptionUri returns URI or null for existing task", async () => {
    const nextId = await getNextTaskId(config.escrowAddress, client.provider!);
    if (nextId === 0n) return;
    const uri = await getTaskDescriptionUri(
      config.escrowAddress,
      client.provider!,
      0n,
      config.deploymentBlock
    );
    expect(uri === null || typeof uri === "string").toBe(true);
  });

  it("getEscrowConfig returns timing and bond params", async () => {
    const cfg = await getEscrowConfig(config.escrowAddress, client.provider!);
    expect(typeof cfg.cooldownPeriod).toBe("bigint");
    expect(typeof cfg.agentResponseWindow).toBe("bigint");
    expect(typeof cfg.disputeBondBps).toBe("bigint");
    expect(typeof cfg.escalationBondBps).toBe("bigint");
    expect(cfg.umaConfig).toBeDefined();
    expect(typeof cfg.umaConfig.oracle).toBe("string");
    expect(typeof cfg.umaConfig.liveness).toBe("bigint");
    expect(typeof cfg.umaConfig.minimumBond).toBe("bigint");
    expect(cfg.cooldownPeriod).toBe(180n);
    expect(cfg.agentResponseWindow).toBe(300n);
    expect(cfg.disputeBondBps).toBe(100n);
    expect(cfg.escalationBondBps).toBe(100n);
  });

  it("fetchFromIpfs fetches content from known public CID", async () => {
    const uri = "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    const content = await fetchFromIpfs(uri, {
      gateway: "https://gateway.pinata.cloud/ipfs/",
    });
    expect(typeof content).toBe("string");
    expect((content as string).length).toBeGreaterThan(0);
  }, 15000);

  it("fetchTaskEvidence returns null or content for task with evidence URIs", async () => {
    const nextId = await getNextTaskId(config.escrowAddress, client.provider!);
    if (nextId === 0n) return;
    const tasks = await getTasksByClient(
      config.escrowAddress,
      client.provider!,
      client.address,
      config.deploymentBlock
    );
    const contested = tasks.filter((t) => t.clientEvidenceURI && t.agentEvidenceURI);
    if (contested.length === 0) return;
    const task = contested[0];
    const result = await fetchTaskEvidence(task);
    expect(result === null || (result.clientEvidence !== undefined && result.agentEvidence !== undefined)).toBe(true);
  }, 15000);
});

const flowCtx = SDK_LIVE_TESTNET && MNEMONIC?.trim();
const descFlow = (pathName: string) => (flowCtx && runFlow(pathName) ? describe : describe.skip);

const COOLDOWN = 180;
const AGENT_RESPONSE_WINDOW = 300;
const PATH_B_CONCEDE_WAIT = COOLDOWN + AGENT_RESPONSE_WINDOW;
const UMA_LIVENESS = 180;

/** Tiny amounts for live flows (below a cent). 18 decimals: 0.001 and 0.0001. */
const LIVE_PAYMENT_AMOUNT = 1n * 10n ** 15n;
const LIVE_STAKE_AMOUNT = 1n * 10n ** 14n;

function loadPlasmaDeployment(): {
  contracts?: { MockOOv3?: string };
  sdk?: { escrowAddress?: string; mockTokenAddress?: string; rpcUrl?: string; deploymentBlock?: number };
} {
  const p = path.join(process.cwd(), "..", "contracts", "deployments", "plasma-testnet.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function getLiveConfig() {
  const deployment = loadPlasmaDeployment();
  return getPlasmaTestnetConfig({
    ipfs: process.env.PINATA_JWT ? { provider: "pinata" as const, apiKey: process.env.PINATA_JWT } : undefined,
    ...(deployment?.sdk && {
      escrowAddress: deployment.sdk.escrowAddress,
      mockTokenAddress: deployment.sdk.mockTokenAddress,
      rpcUrl: deployment.sdk.rpcUrl,
      deploymentBlock: deployment.sdk.deploymentBlock,
    }),
  });
}

const hasIpfs = !!(process.env.PINATA_JWT?.trim());

descFlow("path-a")("SDK live Path A flow (Plasma testnet)", () => {
  it("full Path A: create -> accept -> deposit -> assert -> settle", async () => {
    const config = getLiveConfig();
    const client = getSigner(1);
    const agent = getSigner(2);
    const clientSdk = new ClientSDK(config, client);
    const agentSdk = new AgentSDK(config, agent);

    const tokenAddr = config.mockTokenAddress!;
    const paymentAmount = LIVE_PAYMENT_AMOUNT;
    const stakeAmount = LIVE_STAKE_AMOUNT;
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const taskId = await clientSdk.createTask(
      "ipfs://description",
      tokenAddr,
      paymentAmount,
      deadline
    );

    await agentSdk.acceptTask(taskId, stakeAmount);
    await clientSdk.depositPayment(taskId);
    await agentSdk.assertCompletion(taskId, "Task completed successfully");

    await new Promise((r) => setTimeout(r, (COOLDOWN + 5) * 1000));

    await agentSdk.settleNoContest(taskId);

    const token = new ethers.Contract(
      tokenAddr,
      ["function balanceOf(address) view returns (uint256)"],
      agent.provider
    );
    const balance = await token.balanceOf(agent.address);
    expect(balance).toBeGreaterThan(0n);
  }, 300000);

  it(
    "Path A with IPFS uploads (plain text description + result)",
    async () => {
      if (!hasIpfs) return;
      const cfg = getLiveConfig();
      const c = getSigner(1);
      const a = getSigner(2);
      const clientSdk = new ClientSDK(cfg, c);
      const agentSdk = new AgentSDK(cfg, a);
      const tokenAddr = cfg.mockTokenAddress!;
      const paymentAmount = LIVE_PAYMENT_AMOUNT;
      const stakeAmount = LIVE_STAKE_AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 86400;

      const taskId = await clientSdk.createTask(
        "Build a todo app - IPFS upload test " + Date.now(),
        tokenAddr,
        paymentAmount,
        deadline
      );
      await agentSdk.acceptTask(taskId, stakeAmount);
      await clientSdk.depositPayment(taskId);
      await agentSdk.assertCompletion(
        taskId,
        "Task completed",
        "Result delivered via IPFS " + Date.now()
      );
      await new Promise((r) => setTimeout(r, (COOLDOWN + 5) * 1000));
      await agentSdk.settleNoContest(taskId);

      const task = await clientSdk.getTask(taskId);
      expect(task.resultURI).toBeTruthy();
      expect(task.resultURI).toMatch(/^ipfs:\/\//);
    },
    300000
  );
});

descFlow("path-c")("SDK live Path C flow (Plasma testnet)", () => {
  it("full Path C: create (deadline past) -> accept -> deposit -> timeoutCancellation", async () => {
    const config = getLiveConfig();
    const client = getSigner(1);
    const agent = getSigner(2);
    const clientSdk = new ClientSDK(config, client);
    const agentSdk = new AgentSDK(config, agent);

    const tokenAddr = config.mockTokenAddress!;
    const paymentAmount = LIVE_PAYMENT_AMOUNT;
    const stakeAmount = LIVE_STAKE_AMOUNT;
    const deadline = Math.floor(Date.now() / 1000) - 60;

    const taskId = await clientSdk.createTask(
      "ipfs://description",
      tokenAddr,
      paymentAmount,
      deadline
    );

    await agentSdk.acceptTask(taskId, stakeAmount);
    await clientSdk.depositPayment(taskId);

    const token = new ethers.Contract(
      tokenAddr,
      ["function balanceOf(address) view returns (uint256)"],
      client.provider
    );
    const balanceBefore = await token.balanceOf(client.address);
    await clientSdk.timeoutCancellation(taskId, "deadline exceeded");
    const delta = (await token.balanceOf(client.address)) - balanceBefore;
    expect(delta).toBe(paymentAmount + stakeAmount);
  }, 60000);
});

descFlow("path-d")("SDK live Path D flow (Plasma testnet)", () => {
  it("full Path D: create -> accept -> deposit -> cannotComplete", async () => {
    const config = getLiveConfig();
    const client = getSigner(1);
    const agent = getSigner(2);
    const clientSdk = new ClientSDK(config, client);
    const agentSdk = new AgentSDK(config, agent);

    const tokenAddr = config.mockTokenAddress!;
    const paymentAmount = LIVE_PAYMENT_AMOUNT;
    const stakeAmount = LIVE_STAKE_AMOUNT;
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const taskId = await clientSdk.createTask(
      "ipfs://description",
      tokenAddr,
      paymentAmount,
      deadline
    );

    await agentSdk.acceptTask(taskId, stakeAmount);
    await clientSdk.depositPayment(taskId);

    const token = new ethers.Contract(
      tokenAddr,
      ["function balanceOf(address) view returns (uint256)"],
      client.provider
    );
    const clientBefore = await token.balanceOf(client.address);
    const agentBefore = await token.balanceOf(agent.address);
    await agentSdk.cannotComplete(taskId, "resource unavailable");
    const clientDelta = (await token.balanceOf(client.address)) - clientBefore;
    const agentDelta = (await token.balanceOf(agent.address)) - agentBefore;
    expect(clientDelta).toBe(paymentAmount);
    expect(agentDelta).toBe(stakeAmount);
  }, 60000);
});

descFlow("path-b-concede")("SDK live Path B concede flow (Plasma testnet)", () => {
  it("full Path B concede: create -> accept -> deposit -> assert -> dispute -> settleAgentConceded", async () => {
    const config = getLiveConfig();
    const client = getSigner(1);
    const agent = getSigner(2);
    const clientSdk = new ClientSDK(config, client);
    const agentSdk = new AgentSDK(config, agent);

    const tokenAddr = config.mockTokenAddress!;
    const paymentAmount = LIVE_PAYMENT_AMOUNT;
    const stakeAmount = LIVE_STAKE_AMOUNT;
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const taskId = await clientSdk.createTask(
      "ipfs://description",
      tokenAddr,
      paymentAmount,
      deadline
    );

    await agentSdk.acceptTask(taskId, stakeAmount);
    await clientSdk.depositPayment(taskId);
    await agentSdk.assertCompletion(taskId, "Task completed successfully");
    await clientSdk.disputeTask(taskId, "ipfs://client-evidence");

    await new Promise((r) => setTimeout(r, (PATH_B_CONCEDE_WAIT + 5) * 1000));

    const disputeBond = (paymentAmount * 100n) / 10000n; // 1% = disputeBondBps
    const token = new ethers.Contract(
      tokenAddr,
      ["function balanceOf(address) view returns (uint256)"],
      client.provider
    );
    const balanceBefore = await token.balanceOf(client.address);
    await clientSdk.settleAgentConceded(taskId);
    const delta = (await token.balanceOf(client.address)) - balanceBefore;
    expect(delta).toBe(paymentAmount + disputeBond + stakeAmount);
  }, 600000);
});

descFlow("path-b-uma-agent")("SDK live Path B UMA agent wins (Plasma testnet)", () => {
  it("full Path B UMA agent wins", async () => {
    await runPathBUMA(true);
  }, 300000);
});

descFlow("path-b-uma-client")("SDK live Path B UMA client wins (Plasma testnet)", () => {
  it("full Path B UMA client wins", async () => {
    await runPathBUMA(false);
  }, 300000);
});

async function runPathBUMA(agentWins: boolean): Promise<void> {
  const config = getLiveConfig();
  const deployment = loadPlasmaDeployment();
  const mockOOv3Addr =
    deployment?.contracts?.MockOOv3 ?? config.mockOOv3Address;
  if (!mockOOv3Addr) throw new Error("MockOOv3 address required for Path B UMA");

  const client = getSigner(1);
  const agent = getSigner(2);
  const clientSdk = new ClientSDK(config, client);
  const agentSdk = new AgentSDK(config, agent);

  const tokenAddr = config.mockTokenAddress!;
  const paymentAmount = LIVE_PAYMENT_AMOUNT;
  const stakeAmount = LIVE_STAKE_AMOUNT;
  const deadline = Math.floor(Date.now() / 1000) + 86400;

  const taskId = await clientSdk.createTask(
    "ipfs://description",
    tokenAddr,
    paymentAmount,
    deadline
  );

  await agentSdk.acceptTask(taskId, stakeAmount);
  await clientSdk.depositPayment(taskId);
  await agentSdk.assertCompletion(taskId, "Task completed successfully");
  await clientSdk.disputeTask(taskId, "ipfs://client-evidence");
  await agentSdk.escalateToUMA(taskId, "ipfs://agent-evidence");

  const task = await clientSdk.getTask(taskId);
  const assertionId = task.umaAssertionId;
  if (!assertionId) throw new Error("Expected umaAssertionId after escalateToUMA");

  await new Promise((r) => setTimeout(r, (UMA_LIVENESS + 5) * 1000));

  const mockOOv3 = new ethers.Contract(
    mockOOv3Addr,
    ["function pushResolution(bytes32 assertionId, bool assertedTruthfully) external"],
    agent
  );
  await (await mockOOv3.pushResolution(assertionId, agentWins)).wait();

  const taskAfter = await clientSdk.getTask(taskId);
  expect(Number(taskAfter.status)).toBe(8);
}
