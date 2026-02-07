/**
 * Test Venice dispute resolution (no chain, no IPFS).
 * Run: npx tsx script/test-dispute-resolution.ts  (loads .dev.vars)
 * Or: VENICE_API_KEY=... npx tsx script/test-dispute-resolution.ts
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".dev.vars") });
import { VeniceDisputeService } from "../src/services/veniceDispute";

const EXAMPLES = [
  {
    name: "Agent completed correctly – client disputing on flimsy grounds",
    evidence: {
      taskDescription: "Summarize Twitter sentiment for $ETH in the last 24 hours. Output plain text summary.",
      clientEvidence: "The agent used a different time window (48h instead of 24h).",
      agentEvidence: "The API returned 24h data; the summary reflects that. Client may have misread the output.",
      agentResult: "ETH sentiment over the past 24 hours is moderately bullish. Key themes: ETF flows, L2 activity. Mentions of scaling and upgrades.",
    },
  },
  {
    name: "Client has valid dispute – agent failed task",
    evidence: {
      taskDescription: "Provide current Polymarket odds for 'Will ETH exceed $4000 by end of March?'",
      clientEvidence: "The agent returned odds for a different market (ETH by end of Q1). The specific date March 31 was requested.",
      agentEvidence: "I used the closest available market. Q1 and end-of-March are effectively the same.",
      agentResult: "Polymarket odds: ETH above $4000 by Q1 2025 – 42% Yes, 58% No.",
    },
  },
  {
    name: "Clear agent win – client dispute is subjective",
    evidence: {
      taskDescription: "Write a 2–3 sentence summary of today's crypto news.",
      clientEvidence: "The summary missed an important story about staking.",
      agentEvidence: "I summarized the top stories by volume and relevance. Staking news was lower priority that day.",
      agentResult: "Today's crypto: ETF inflows remain strong. Major L2 upgrade announced. DeFi volumes up 15%.",
    },
  },
];

async function main() {
  const apiKey = process.env.VENICE_API_KEY;
  if (!apiKey?.trim()) {
    console.error("Set VENICE_API_KEY in .dev.vars or env. Example:");
    console.error("  VENICE_API_KEY=... npx tsx script/test-dispute-resolution.ts");
    process.exit(1);
  }

  const venice = new VeniceDisputeService(apiKey);

  for (const ex of EXAMPLES) {
    console.log("\n" + "─".repeat(60));
    console.log("Example:", ex.name);
    console.log("─".repeat(60));
    console.log("Task:", ex.evidence.taskDescription.slice(0, 80) + "...");
    const result = await venice.decideDispute(ex.evidence);
    console.log("Winner:", result.winner);
    console.log("Reason:", result.reason ?? "(none)");
    if (result.raw) console.log("Raw:", result.raw.slice(0, 150) + (result.raw.length > 150 ? "..." : ""));
  }
  console.log("\n" + "─".repeat(60) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
