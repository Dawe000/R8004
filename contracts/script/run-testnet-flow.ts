/**
 * Run flows on Plasma testnet using the SDK.
 * Requires: MNEMONIC in .env, funded addresses, deployed contracts.
 *
 * npm run testnet:flow [path]
 *   path: path-a (default) | path-c | path-d
 */
import "dotenv/config";
import { ethers } from "ethers";
import { ClientSDK, AgentSDK } from "@erc8001/agent-task-sdk";
import * as fs from "fs";
import * as path from "path";

const COOLDOWN_SECONDS = 180;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const pathArg = (process.env.FLOW_PATH ?? process.argv[process.argv.length - 1]) || "path-a";
if (!["path-a", "path-c", "path-d"].includes(pathArg)) {
  console.error("Usage: npm run testnet:flow  (default: path-a)");
  console.error("       FLOW_PATH=path-c npm run testnet:flow");
  console.error("       FLOW_PATH=path-d npm run testnet:flow");
  process.exit(1);
}

async function main() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic?.trim()) {
    throw new Error("Set MNEMONIC in .env");
  }

  const deploymentPath = path.join(process.cwd(), "deployments", "plasma-testnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const provider = new ethers.JsonRpcProvider(deployment.sdk.rpcUrl);
  const m = ethers.Mnemonic.fromPhrase(mnemonic.trim());
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed());

  const client = root.derivePath("m/44'/60'/0'/0/1").connect(provider);
  const agent = root.derivePath("m/44'/60'/0'/0/2").connect(provider);

  const config = {
    escrowAddress: deployment.sdk.escrowAddress,
    chainId: deployment.chainId,
    rpcUrl: deployment.sdk.rpcUrl,
    ipfs: process.env.PINATA_JWT
      ? { provider: "pinata" as const, apiKey: process.env.PINATA_JWT }
      : undefined,
  };

  const clientSdk = new ClientSDK(config, client);
  const agentSdk = new AgentSDK(config, agent);

  const paymentAmount = ethers.parseEther("100");
  const stakeAmount = ethers.parseEther("10");
  const tokenAddr = deployment.sdk.mockTokenAddress;
  const token = new ethers.Contract(
    tokenAddr,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );

  console.log(pathArg.toUpperCase(), "on Plasma testnet");
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
    console.log("Path A complete. Agent received:", ethers.formatEther(delta), "TST");
    if (delta !== paymentAmount + stakeAmount) throw new Error(`Expected ${paymentAmount + stakeAmount}, got ${delta}`);
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
    console.log("Path C complete. Client received:", ethers.formatEther(delta), "TST");
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
    console.log("Path D complete. Client +", ethers.formatEther(clientDelta), "TST, Agent +", ethers.formatEther(agentDelta), "TST");
    if (clientDelta !== paymentAmount || agentDelta !== stakeAmount) throw new Error(`Expected client=${paymentAmount}, agent=${stakeAmount}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
