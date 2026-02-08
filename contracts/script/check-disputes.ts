/**
 * Check all current escalated disputes, whether UMA liveness allows resolution, and which are resolved.
 *
 * Plasma:  npm run check:disputes [--network plasma-testnet]
 * Flare:   npm run check:disputes:flare [--network coston2]
 */
import "dotenv/config";
import { Contract, JsonRpcProvider } from "ethers";
import {
  getEscalatedDisputes,
  getEscrowConfig,
  PLASMA_TESTNET_DEFAULTS,
  COSTON2_FIRELIGHT_DEFAULTS,
} from "@erc8001/agent-task-sdk";
import * as fs from "fs";
import * as path from "path";

const BLOCK_TIME_SEC = 2; // Plasma and Coston2 both ~2s
const MOCK_OO_ABI = ["function settled(bytes32) external view returns (bool)"];
/** Flare Coston2 RPC limit for eth_getLogs */
const FLARE_MAX_LOG_BLOCK_RANGE = 30;

const isFlare = process.env.CHECK_DISPUTES_NETWORK === "flare";

async function main() {
  const deploymentFile = isFlare ? "coston2-firelight.json" : "plasma-testnet.json";
  const deploymentPath = path.join(process.cwd(), "deployments", deploymentFile);
  const defaults = isFlare ? COSTON2_FIRELIGHT_DEFAULTS : PLASMA_TESTNET_DEFAULTS;

  let deployment: {
    chainId?: number;
    contracts?: { MockOOv3?: string };
    sdk?: { escrowAddress?: string; rpcUrl?: string; deploymentBlock?: number };
  } | null = null;
  if (fs.existsSync(deploymentPath)) {
    deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  const escrowAddress =
    deployment?.sdk?.escrowAddress ?? process.env.ESCROW_ADDRESS ?? defaults.escrowAddress;
  const rpcUrl = deployment?.sdk?.rpcUrl ?? process.env.RPC_URL ?? defaults.rpcUrl;
  const deploymentBlock =
    deployment?.sdk?.deploymentBlock ??
    (process.env.DEPLOYMENT_BLOCK ? parseInt(process.env.DEPLOYMENT_BLOCK, 10) : undefined) ??
    defaults.deploymentBlock;

  const provider = new JsonRpcProvider(rpcUrl);
  const currentBlock = await provider.getBlockNumber();

  const mockOOAddress =
    deployment?.contracts?.MockOOv3 ?? process.env.MOCK_OOv3_ADDRESS ?? defaults.mockOOv3Address;
  const mockOO = new Contract(mockOOAddress, MOCK_OO_ABI, provider);

  const [escrowConfig, escalated] = await Promise.all([
    getEscrowConfig(escrowAddress, provider),
    getEscalatedDisputes(escrowAddress, provider, deploymentBlock, currentBlock, {
      maxBlockRange: isFlare ? FLARE_MAX_LOG_BLOCK_RANGE : undefined,
    }),
  ]);

  const livenessSeconds = Number(escrowConfig.umaConfig.liveness);
  const livenessBlocks = livenessSeconds / BLOCK_TIME_SEC;

  console.log("");
  console.log("Escalated disputes (UMA liveness check)", isFlare ? "[Flare Coston2]" : "[Plasma]");
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
    const secondsRemaining = blocksRemaining * BLOCK_TIME_SEC;

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
