/**
 * Run flows on Plasma testnet using the SDK.
 * Requires: MNEMONIC in .env, funded addresses, deployed contracts.
 *
 * npm run testnet:flow [path]
 *   path: path-a | path-b-concede | path-b-uma-agent | path-b-uma-client | path-c | path-d
 */
import "dotenv/config";
import * as dotenv from "dotenv";
import * as path from "path";
// Load sdk/.env if PINATA_JWT not set (for path-b-uma IPFS uploads)
if (!process.env.PINATA_JWT) {
  dotenv.config({ path: path.join(process.cwd(), "..", "sdk", ".env") });
}
import { ethers } from "ethers";
import {
  ClientSDK,
  AgentSDK,
  getPlasmaTestnetConfig,
  getEscrowConfig,
} from "@erc8001/agent-task-sdk";
import * as fs from "fs";
import { TESTNET_CONFIG } from "../../config/testnet";

const COOLDOWN_SECONDS = TESTNET_CONFIG.COOLDOWN_PERIOD;
const AGENT_RESPONSE_WINDOW_SECONDS = TESTNET_CONFIG.AGENT_RESPONSE_WINDOW;
// settleAgentConceded requires block.timestamp >= cooldownEndsAt + agentResponseWindow
const PATH_B_CONCEDE_WAIT_SECONDS =
  TESTNET_CONFIG.COOLDOWN_PERIOD + TESTNET_CONFIG.AGENT_RESPONSE_WINDOW;
const UMA_LIVENESS_SECONDS = TESTNET_CONFIG.UMA_LIVENESS;

/** Tiny amounts for testnet flows (below a cent). USDT0 on Plasma has 6 decimals. */
const USDT0_DECIMALS = 6;
const PAYMENT_AMOUNT = ethers.parseUnits("0.001", USDT0_DECIMALS);   // 0.001 USDT
const STAKE_AMOUNT = ethers.parseUnits("0.0001", USDT0_DECIMALS);    // 0.0001 USDT

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const VALID_PATHS = [
  "path-a",
  "path-b-concede",
  "path-b-uma-agent",
  "path-b-uma-client",
  "path-b-uma-escalate", // Escalate only – leaves dispute for DVM to resolve
  "path-c",
  "path-d",
];
const rawPath = process.env.FLOW_PATH ?? process.argv.find((a) => a.startsWith("path-"));
let pathArg: string;
if (!rawPath || VALID_PATHS.includes(rawPath)) {
  pathArg = rawPath ?? "path-a";
} else {
  console.error("Invalid path:", rawPath);
  console.error("Valid: path-a | path-b-concede | path-b-uma-agent | path-b-uma-client | path-b-uma-escalate | path-c | path-d");
  process.exit(1);
}

async function main() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic?.trim()) {
    throw new Error("Set MNEMONIC in .env");
  }

  const baseConfig = getPlasmaTestnetConfig({
    ipfs: process.env.PINATA_JWT
      ? { provider: "pinata" as const, apiKey: process.env.PINATA_JWT }
      : undefined,
  });

  const deploymentPath = path.join(
    process.cwd(),
    "deployments",
    "plasma-testnet.json"
  );
  let deployment: { chainId?: number; contracts?: { MockOOv3?: string }; sdk?: Record<string, string> } | null = null;
  if (fs.existsSync(deploymentPath)) {
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  const config = {
    ...baseConfig,
    ...(deployment?.sdk?.escrowAddress && {
      escrowAddress: deployment.sdk.escrowAddress,
    }),
    ...(deployment?.chainId && { chainId: deployment.chainId }),
    ...(deployment?.sdk?.rpcUrl && { rpcUrl: deployment.sdk.rpcUrl }),
  };

  const tokenAddr =
    deployment?.sdk?.mockTokenAddress ?? baseConfig.mockTokenAddress!;
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const m = ethers.Mnemonic.fromPhrase(mnemonic.trim());
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed());

  const client = root.derivePath("m/44'/60'/0'/0/1").connect(provider);
  const agent = root.derivePath("m/44'/60'/0'/0/2").connect(provider);

  const clientSdk = new ClientSDK(config, client);
  const agentSdk = new AgentSDK(config, agent);

  const paymentAmount = PAYMENT_AMOUNT;
  const stakeAmount = STAKE_AMOUNT;
  const token = new ethers.Contract(
    tokenAddr,
    [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
    ],
    provider
  );

  console.log(pathArg.toUpperCase(), "on Plasma testnet");
  console.log("  Escrow:", config.escrowAddress);
  console.log("  Client:", await client.getAddress());
  console.log("  Agent:", await agent.getAddress());
  console.log("");

  if (pathArg === "path-a") {
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task...");
    const taskId = await clientSdk.createTask("ipfs://description", tokenAddr, paymentAmount, deadline);
    console.log("   TaskId:", taskId.toString());

    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, stakeAmount);
    console.log("   Done");

    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");

    console.log("4. Agent asserts completion...");
    await agentSdk.assertCompletion(taskId, "Task completed successfully");
    console.log("   Done");

    console.log(`5. Waiting ${COOLDOWN_SECONDS}s for cooldown...`);
    await sleep(COOLDOWN_SECONDS * 1000);

    const balanceBefore = await token.balanceOf(agent.address);
    console.log("6. Agent settles (no contest)...");
    await agentSdk.settleNoContest(taskId);
    const delta = (await token.balanceOf(agent.address)) - balanceBefore;
    console.log("Path A complete. Agent received:", ethers.formatUnits(delta, USDT0_DECIMALS), "USDT0");
    if (delta !== paymentAmount + stakeAmount) throw new Error(`Expected ${paymentAmount + stakeAmount}, got ${delta}`);
  } else if (pathArg === "path-b-concede") {
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task...");
    const taskId = await clientSdk.createTask("ipfs://description", tokenAddr, paymentAmount, deadline);
    console.log("   TaskId:", taskId.toString());

    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, stakeAmount);
    console.log("   Done");

    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");

    console.log("4. Agent asserts completion...");
    await agentSdk.assertCompletion(taskId, "Task completed successfully");
    console.log("   Done");

    console.log("5. Client disputes...");
    await clientSdk.disputeTask(taskId, "ipfs://client-evidence");
    console.log("   Done");

    console.log(
      `6. Waiting ${PATH_B_CONCEDE_WAIT_SECONDS}s (cooldown + agent response window)...`
    );
    await sleep(PATH_B_CONCEDE_WAIT_SECONDS * 1000);

    const disputeBond = (paymentAmount * 100n) / 10000n;
    const balanceBefore = await token.balanceOf(client.address);
    console.log("7. Client settles (agent conceded)...");
    await clientSdk.settleAgentConceded(taskId);
    const delta = (await token.balanceOf(client.address)) - balanceBefore;
    console.log("Path B (concede) complete. Client received:", ethers.formatUnits(delta, USDT0_DECIMALS), "USDT0");
    if (delta !== paymentAmount + disputeBond + stakeAmount) {
      throw new Error(`Expected ${paymentAmount + disputeBond + stakeAmount}, got ${delta}`);
    }
  } else if (pathArg === "path-b-uma-agent" || pathArg === "path-b-uma-client" || pathArg === "path-b-uma-escalate") {
    if (!config.ipfs) {
      throw new Error("PINATA_JWT required for path-b-uma (IPFS uploads). Set in .env or sdk/.env.");
    }
    const agentWins = pathArg === "path-b-uma-agent";
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task (uploading description to IPFS)...");
    const taskId = await clientSdk.createTask("Task: verify completion", tokenAddr, paymentAmount, deadline);
    console.log("   TaskId:", taskId.toString());

    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, stakeAmount);
    console.log("   Done");

    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");

    console.log("4. Agent asserts completion...");
    await agentSdk.assertCompletion(taskId, "Task completed successfully");
    console.log("   Done");

    console.log("5. Client disputes (uploading evidence to IPFS)...");
    await clientSdk.disputeTask(taskId, { reason: "Client disputes: task was not completed correctly" });
    console.log("   Done");

    // Escalation bond = max(1% of payment, umaConfig.minimumBond). With 6-decimal USDT0, minimumBond=1e18 => 1e12 USDT (impossible). Fund agent if bond is achievable.
    const taskForBond = await clientSdk.getTask(taskId);
    const escrowCfg = await getEscrowConfig(config.escrowAddress!, provider);
    const computedBond = (taskForBond.paymentAmount * escrowCfg.escalationBondBps) / 10000n;
    const requiredBond =
      computedBond > escrowCfg.umaConfig.minimumBond
        ? computedBond
        : escrowCfg.umaConfig.minimumBond;
    if (requiredBond >= 10n ** 15n) {
      throw new Error(
        `Escalation bond is ${requiredBond} raw (minimumBond=${escrowCfg.umaConfig.minimumBond}). ` +
          `For 6-decimal USDT0 this is too large. Set UMA_MINIMUM_BOND to 1e6 in contracts/config/testnet.ts and redeploy escrow.`
      );
    }
    const agentBalance = await token.balanceOf(agent.address);
    if (agentBalance < requiredBond) {
      const shortfall = requiredBond - agentBalance;
      console.log(
        `   Funding agent with ${ethers.formatUnits(shortfall, USDT0_DECIMALS)} USDT0 for escalation bond...`
      );
      const tokenWithClient = token.connect(client) as ethers.Contract;
      const tx = await tokenWithClient.transfer(agent.address, shortfall);
      await tx.wait();
    }

    console.log("6. Agent escalates to UMA (uploading evidence to IPFS)...");
    await agentSdk.escalateToUMA(taskId, { reason: "Agent claims task was completed as specified" });
    const task = await clientSdk.getTask(taskId);
    const assertionId = task.umaAssertionId;
    console.log("   AssertionId:", assertionId);
    if (pathArg === "path-b-uma-escalate") {
      console.log(`7. Waiting ${UMA_LIVENESS_SECONDS}s for UMA liveness...`);
      await sleep(UMA_LIVENESS_SECONDS * 1000);
      console.log("8. Polling until DVM resolves (run DVM worker + trigger cron in another terminal)...");
      const pollIntervalMs = 15000;
      const timeoutMs = 600000; // 10 min
      const start = Date.now();
      for (;;) {
        const t = await clientSdk.getTask(taskId);
        if (Number(t.status) === 8) {
          console.log("   Resolved. Path B (UMA escalate + DVM) complete.");
          return;
        }
        if (Date.now() - start > timeoutMs) {
          throw new Error(`Timeout: task not resolved after ${timeoutMs / 1000}s. Run DVM worker and trigger cron.`);
        }
        console.log("   Status:", t.status, "- waiting", pollIntervalMs / 1000, "s...");
        await sleep(pollIntervalMs);
      }
    }

    console.log(`7. Waiting ${UMA_LIVENESS_SECONDS}s for UMA liveness...`);
    await sleep(UMA_LIVENESS_SECONDS * 1000);

    const mockOOv3Addr =
      deployment?.contracts?.MockOOv3 ?? baseConfig.mockOOv3Address;
    const mockOOv3 = new ethers.Contract(
      mockOOv3Addr,
      ["function pushResolution(bytes32 assertionId, bool assertedTruthfully) external"],
      agent
    );
    console.log("8. Resolving via MockOOv3 (agent wins:", agentWins, ")...");
    await (await mockOOv3.pushResolution(assertionId, agentWins)).wait();

    const taskAfter = await clientSdk.getTask(taskId);
    if (Number(taskAfter.status) !== 8) throw new Error("Expected task status Resolved (8), got " + taskAfter.status);
    console.log("Path B (UMA, " + (agentWins ? "agent" : "client") + " wins) complete.");
  } else if (pathArg === "path-c") {
    const deadline = Math.floor(Date.now() / 1000) - 60; // already passed
    console.log("1. Client creates task (deadline in past)...");
    const taskId = await clientSdk.createTask("ipfs://description", tokenAddr, paymentAmount, deadline);
    console.log("   TaskId:", taskId.toString());

    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, stakeAmount);
    console.log("   Done");

    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");

    const balanceBefore = await token.balanceOf(client.address);
    console.log("4. Client timeout cancellation...");
    await clientSdk.timeoutCancellation(taskId, "deadline exceeded");
    const delta = (await token.balanceOf(client.address)) - balanceBefore;
    console.log("Path C complete. Client received:", ethers.formatUnits(delta, USDT0_DECIMALS), "USDT0");
    if (delta !== paymentAmount + stakeAmount) throw new Error(`Expected ${paymentAmount + stakeAmount}, got ${delta}`);
  } else if (pathArg === "path-d") {
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task...");
    const taskId = await clientSdk.createTask("ipfs://description", tokenAddr, paymentAmount, deadline);
    console.log("   TaskId:", taskId.toString());

    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, stakeAmount);
    console.log("   Done");

    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");

    const clientBefore = await token.balanceOf(client.address);
    const agentBefore = await token.balanceOf(agent.address);
    console.log("4. Agent cannot complete...");
    await agentSdk.cannotComplete(taskId, "resource unavailable");
    const clientDelta = (await token.balanceOf(client.address)) - clientBefore;
    const agentDelta = (await token.balanceOf(agent.address)) - agentBefore;
    console.log("Path D complete. Client +", ethers.formatUnits(clientDelta, USDT0_DECIMALS), "USDT0, Agent +", ethers.formatUnits(agentDelta, USDT0_DECIMALS), "USDT0");
    if (clientDelta !== paymentAmount || agentDelta !== stakeAmount) throw new Error(`Expected client=${paymentAmount}, agent=${stakeAmount}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
