/**
 * Run flows on Flare Coston2 using the SDK (same paths as Plasma).
 * Requires: MNEMONIC in .env, Client/Agent funded with C2FLR + FXRP (agent needs yFXRP for stake).
 *
 * npm run testnet:flow:coston2 [path]
 *   path: path-a | path-b-concede | path-b-uma-agent | path-b-uma-client | path-b-uma-escalate | path-c | path-d
 */
import "dotenv/config";
import * as dotenv from "dotenv";
import * as path from "path";
if (!process.env.PINATA_JWT) {
  dotenv.config({ path: path.join(process.cwd(), "..", "sdk", ".env") });
}
import { ethers } from "ethers";
import {
  ClientSDK,
  AgentSDK,
  getCoston2FirelightConfig,
  getEscrowConfig,
} from "@erc8001/agent-task-sdk";
import * as fs from "fs";
import { TESTNET_CONFIG } from "../../config/testnet";

// Coston2 escrow is deployed with 24h cooldown (86400) – read from chain instead of TESTNET_CONFIG
const PATH_B_CONCEDE_WAIT_EXTRA = TESTNET_CONFIG.AGENT_RESPONSE_WINDOW;
const UMA_LIVENESS_SECONDS = TESTNET_CONFIG.UMA_LIVENESS;

/** Tiny amounts (6 decimals) – same scale as Plasma, safe with ~3 FXRP per wallet */
const FXRP_DECIMALS = 6;
const PAYMENT_AMOUNT = ethers.parseUnits("0.001", FXRP_DECIMALS);
const STAKE_AMOUNT = ethers.parseUnits("0.0001", FXRP_DECIMALS);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const VALID_PATHS = [
  "path-a",
  "path-b-concede",
  "path-b-uma-agent",
  "path-b-uma-client",
  "path-b-uma-escalate",
  "path-c",
  "path-d",
];
const rawPath = process.env.FLOW_PATH ?? process.argv.find((a) => a.startsWith("path-"));
const pathArg = rawPath && VALID_PATHS.includes(rawPath) ? rawPath : "path-a";

const VAULT_ABI = [
  "function deposit(uint256 assets, address receiver) external returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

async function main() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic?.trim()) throw new Error("Set MNEMONIC in .env");

  const baseConfig = getCoston2FirelightConfig({
    ipfs: process.env.PINATA_JWT
      ? { provider: "pinata" as const, apiKey: process.env.PINATA_JWT }
      : undefined,
  });

  const deploymentPath = path.join(process.cwd(), "deployments", "coston2-firelight.json");
  let deployment: {
    chainId?: number;
    contracts?: { MockOOv3?: string };
    sdk?: Record<string, string>;
  } | null = null;
  if (fs.existsSync(deploymentPath)) {
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  const config = {
    ...baseConfig,
    ...(deployment?.sdk?.escrowAddress && { escrowAddress: deployment.sdk.escrowAddress }),
    ...(deployment?.chainId && { chainId: deployment.chainId }),
    ...(deployment?.sdk?.rpcUrl && { rpcUrl: deployment.sdk.rpcUrl }),
    ...(deployment?.sdk?.deploymentBlock && {
      deploymentBlock: parseInt(deployment.sdk.deploymentBlock as string, 10),
    }),
    ...(deployment?.sdk?.mockOOv3Address && { mockOOv3Address: deployment.sdk.mockOOv3Address }),
  };

  const paymentTokenAddr = deployment?.sdk?.fxrpTokenAddress ?? baseConfig.fxrpTokenAddress;
  const stakeTokenAddr = deployment?.sdk?.yFXRPTokenAddress ?? baseConfig.fFXRPVaultAddress;
  // Custom yFXRP vault: same contract for deposit() and share balanceOf
  const vaultAddr = stakeTokenAddr;

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const m = ethers.Mnemonic.fromPhrase(mnemonic.trim());
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed());
  const client = root.derivePath("m/44'/60'/0'/0/1").connect(provider);
  const agent = root.derivePath("m/44'/60'/0'/0/2").connect(provider);

  const clientSdk = new ClientSDK(config, client);
  const agentSdk = new AgentSDK(config, agent);

  const fxrp = new ethers.Contract(
    paymentTokenAddr,
    [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
    ],
    provider
  );
  const yFxrp = new ethers.Contract(
    stakeTokenAddr,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );

  // Ensure agent has yFXRP for stake (deposit FXRP to vault if needed)
  let agentYFxrp = await yFxrp.balanceOf(agent.address);
  if (agentYFxrp < STAKE_AMOUNT) {
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, agent);
    const depositAmount = ethers.parseUnits("0.001", FXRP_DECIMALS);
    const fxrpWithAgent = new ethers.Contract(
      paymentTokenAddr,
      ["function approve(address spender, uint256 amount) returns (bool)"],
      agent
    );
    console.log("0. Agent deposits 0.001 FXRP to vault for yFXRP...");
    await (await fxrpWithAgent.approve(vaultAddr, depositAmount)).wait();
    await (await vault.deposit(depositAmount, agent.address)).wait();
    agentYFxrp = await yFxrp.balanceOf(agent.address);
    console.log("   Done. Agent yFXRP:", ethers.formatUnits(agentYFxrp, FXRP_DECIMALS));
  }

  console.log(pathArg.toUpperCase(), "on Flare Coston2");
  console.log("  Escrow:", config.escrowAddress);
  console.log("  Client:", await client.getAddress());
  console.log("  Agent:", await agent.getAddress());
  console.log("");

  if (pathArg === "path-a") {
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task (FXRP payment, yFXRP stake)...");
    const taskId = await clientSdk.createTask(
      "ipfs://description",
      paymentTokenAddr,
      PAYMENT_AMOUNT,
      deadline,
      stakeTokenAddr
    );
    console.log("   TaskId:", taskId.toString());

    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, STAKE_AMOUNT);
    console.log("   Done");

    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");

    console.log("4. Agent asserts completion...");
    await agentSdk.assertCompletion(taskId, "Task completed successfully");
    console.log("   Done");

    const escrowCfg = await getEscrowConfig(config.escrowAddress!, provider);
    const cooldownSec = Number(escrowCfg.cooldownPeriod);
    console.log(`5. Waiting ${cooldownSec}s for cooldown (from escrow)...`);
    await sleep(cooldownSec * 1000);

    console.log("6. Agent settles (no contest)...");
    await agentSdk.settleNoContest(taskId);
    console.log("Path A complete.");
  } else if (pathArg === "path-b-concede") {
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task...");
    const taskId = await clientSdk.createTask(
      "ipfs://description",
      paymentTokenAddr,
      PAYMENT_AMOUNT,
      deadline,
      stakeTokenAddr
    );
    console.log("   TaskId:", taskId.toString());
    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, STAKE_AMOUNT);
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
    const escrowCfgB = await getEscrowConfig(config.escrowAddress!, provider);
    const waitSec = Number(escrowCfgB.cooldownPeriod) + PATH_B_CONCEDE_WAIT_EXTRA;
    console.log(`6. Waiting ${waitSec}s (cooldown + agent response window)...`);
    await sleep(waitSec * 1000);
    console.log("7. Client settles (agent conceded)...");
    await clientSdk.settleAgentConceded(taskId);
    console.log("Path B (concede) complete.");
  } else if (
    pathArg === "path-b-uma-agent" ||
    pathArg === "path-b-uma-client" ||
    pathArg === "path-b-uma-escalate"
  ) {
    if (!config.ipfs) throw new Error("PINATA_JWT required for path-b-uma. Set in .env or sdk/.env.");
    const agentWins = pathArg === "path-b-uma-agent";
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task (uploading description to IPFS)...");
    const taskId = await clientSdk.createTask(
      "Task: verify completion",
      paymentTokenAddr,
      PAYMENT_AMOUNT,
      deadline,
      stakeTokenAddr
    );
    console.log("   TaskId:", taskId.toString());
    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, STAKE_AMOUNT);
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

    const taskForBond = await clientSdk.getTask(taskId);
    const escrowCfg = await getEscrowConfig(config.escrowAddress!, provider);
    const computedBond = (taskForBond.paymentAmount * escrowCfg.escalationBondBps) / 10000n;
    const requiredBond =
      computedBond > escrowCfg.umaConfig.minimumBond ? computedBond : escrowCfg.umaConfig.minimumBond;
    if (requiredBond >= 10n ** 15n) {
      throw new Error(
        `Escalation bond too large (${requiredBond}). Redeploy escrow with lower UMA_MINIMUM_BOND.`
      );
    }
    const agentFxrpBalance = await fxrp.balanceOf(agent.address);
    if (agentFxrpBalance < requiredBond) {
      const shortfall = requiredBond - agentFxrpBalance;
      console.log(`   Funding agent with ${ethers.formatUnits(shortfall, FXRP_DECIMALS)} FXRP for escalation bond...`);
      await (await fxrp.connect(client).transfer(agent.address, shortfall)).wait();
    }

    console.log("6. Agent escalates to UMA (uploading evidence to IPFS)...");
    await agentSdk.escalateToUMA(taskId, { reason: "Agent claims task was completed as specified" });
    const task = await clientSdk.getTask(taskId);
    const assertionId = task.umaAssertionId;
    console.log("   AssertionId:", assertionId);

    if (pathArg === "path-b-uma-escalate") {
      console.log(`7. Waiting ${UMA_LIVENESS_SECONDS}s for UMA liveness...`);
      await sleep(UMA_LIVENESS_SECONDS * 1000);
      console.log("8. Polling until DVM resolves...");
      const pollIntervalMs = 15000;
      const timeoutMs = 600000;
      const start = Date.now();
      for (;;) {
        const t = await clientSdk.getTask(taskId);
        if (Number(t.status) === 8) {
          console.log("   Resolved. Path B (UMA escalate + DVM) complete.");
          return;
        }
        if (Date.now() - start > timeoutMs) {
          throw new Error(`Timeout: task not resolved after ${timeoutMs / 1000}s.`);
        }
        console.log("   Status:", t.status, "- waiting", pollIntervalMs / 1000, "s...");
        await sleep(pollIntervalMs);
      }
    }

    console.log(`7. Waiting ${UMA_LIVENESS_SECONDS}s for UMA liveness...`);
    await sleep(UMA_LIVENESS_SECONDS * 1000);
    const mockOOv3Addr = deployment?.contracts?.MockOOv3 ?? config.mockOOv3Address;
    const mockOOv3 = new ethers.Contract(
      mockOOv3Addr,
      ["function pushResolution(bytes32 assertionId, bool assertedTruthfully) external"],
      agent
    );
    console.log("8. Resolving via MockOOv3 (agent wins:", agentWins, ")...");
    await (await mockOOv3.pushResolution(assertionId, agentWins)).wait();
    const taskAfter = await clientSdk.getTask(taskId);
    if (Number(taskAfter.status) !== 8) throw new Error("Expected status Resolved (8), got " + taskAfter.status);
    console.log("Path B (UMA, " + (agentWins ? "agent" : "client") + " wins) complete.");
  } else if (pathArg === "path-c") {
    const deadline = Math.floor(Date.now() / 1000) - 60;
    console.log("1. Client creates task (deadline in past)...");
    const taskId = await clientSdk.createTask(
      "ipfs://description",
      paymentTokenAddr,
      PAYMENT_AMOUNT,
      deadline,
      stakeTokenAddr
    );
    console.log("   TaskId:", taskId.toString());
    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, STAKE_AMOUNT);
    console.log("   Done");
    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");
    console.log("4. Client timeout cancellation...");
    await clientSdk.timeoutCancellation(taskId, "deadline exceeded");
    console.log("Path C complete.");
  } else if (pathArg === "path-d") {
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    console.log("1. Client creates task...");
    const taskId = await clientSdk.createTask(
      "ipfs://description",
      paymentTokenAddr,
      PAYMENT_AMOUNT,
      deadline,
      stakeTokenAddr
    );
    console.log("   TaskId:", taskId.toString());
    console.log("2. Agent accepts task...");
    await agentSdk.acceptTask(taskId, STAKE_AMOUNT);
    console.log("   Done");
    console.log("3. Client deposits payment...");
    await clientSdk.depositPayment(taskId);
    console.log("   Done");
    console.log("4. Agent cannot complete...");
    await agentSdk.cannotComplete(taskId, "resource unavailable");
    console.log("Path D complete.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
