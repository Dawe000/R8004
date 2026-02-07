/**
 * Check all current escalated disputes, whether UMA liveness allows resolution, and which are resolved.
 *
 * npm run check:disputes [--network plasma-testnet]
 */
import "dotenv/config";
import { Contract, JsonRpcProvider } from "ethers";
import {
  getEscalatedDisputes,
  getEscrowConfig,
  PLASMA_TESTNET_DEFAULTS,
} from "@erc8001/agent-task-sdk";
import * as fs from "fs";
import * as path from "path";

const PLASMA_BLOCK_TIME_SEC = 2;
const MOCK_OO_ABI = ["function settled(bytes32) external view returns (bool)"];

async function main() {
  const deploymentPath = path.join(process.cwd(), "deployments", "plasma-testnet.json");
  let deployment: {
    chainId?: number;
    contracts?: { MockOOv3?: string };
    sdk?: { escrowAddress?: string; rpcUrl?: string; deploymentBlock?: number };
  } | null = null;
  if (fs.existsSync(deploymentPath)) {
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  const escrowAddress =
    deployment?.sdk?.escrowAddress ?? process.env.ESCROW_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.escrowAddress;
  const rpcUrl =
    deployment?.sdk?.rpcUrl ?? process.env.RPC_URL ?? PLASMA_TESTNET_DEFAULTS.rpcUrl;
  const deploymentBlock =
    deployment?.sdk?.deploymentBlock ??
    (process.env.DEPLOYMENT_BLOCK ? parseInt(process.env.DEPLOYMENT_BLOCK, 10) : undefined) ??
    PLASMA_TESTNET_DEFAULTS.deploymentBlock;

  const provider = new JsonRpcProvider(rpcUrl);
  const currentBlock = await provider.getBlockNumber();

  const mockOOAddress =
    deployment?.contracts?.MockOOv3 ?? process.env.MOCK_OOv3_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.mockOOv3Address;
  const mockOO = new Contract(mockOOAddress, MOCK_OO_ABI, provider);

  const [escrowConfig, escalated] = await Promise.all([
    getEscrowConfig(escrowAddress, provider),
    getEscalatedDisputes(escrowAddress, provider, deploymentBlock, currentBlock),
  ]);

  const livenessSeconds = Number(escrowConfig.umaConfig.liveness);
  const livenessBlocks = livenessSeconds / PLASMA_BLOCK_TIME_SEC;

  console.log("");
  console.log("Escalated disputes (UMA liveness check)");
  console.log("─".repeat(70));
  console.log("Escrow:", escrowAddress);
  console.log("Current block:", currentBlock);
  console.log("Liveness:", livenessSeconds, "s (", livenessBlocks, "blocks)");
  console.log("");

  if (escalated.length === 0) {
    console.log("No escalated disputes found.");
    return;
  }

  for (const d of escalated) {
    const [blocksSinceEscalation, settled] = await Promise.all([
      Promise.resolve(currentBlock - d.blockNumber),
      mockOO.settled(d.assertionId),
    ]);
    const blocksRemaining = Math.max(0, Math.ceil(livenessBlocks) - blocksSinceEscalation);
    const canResolve = blocksSinceEscalation >= livenessBlocks;
    const secondsRemaining = blocksRemaining * PLASMA_BLOCK_TIME_SEC;

    console.log("Task", d.taskId.toString());
    console.log("  AssertionId:", d.assertionId.slice(0, 18) + "...");
    console.log("  Escalated at block:", d.blockNumber);
    console.log("  Blocks since escalation:", blocksSinceEscalation, "/", Math.ceil(livenessBlocks));
    console.log(
      "  UMA can resolve:",
      canResolve ? "YES" : `NO (${blocksRemaining} blocks, ~${secondsRemaining}s remaining)`
    );
    console.log("  Resolved on-chain:", settled ? "YES" : "NO");
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
