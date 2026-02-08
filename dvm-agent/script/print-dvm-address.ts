/**
 * Print the DVM wallet address (derived from DVM_PRIVATE_KEY).
 * Fund this address with XPL on Plasma testnet and C2FLR on Flare Coston2 so the worker can send pushResolution.
 *
 * Run from dvm-agent: npx tsx script/print-dvm-address.ts
 * Loads .dev.vars if present; otherwise uses DVM_PRIVATE_KEY from env.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { Wallet } from "ethers";

dotenv.config({ path: path.join(process.cwd(), ".dev.vars") });

const key = process.env.DVM_PRIVATE_KEY;
if (!key?.startsWith("0x")) {
  console.error("Set DVM_PRIVATE_KEY in .dev.vars or env (e.g. 0x...)");
  process.exit(1);
}

const wallet = new Wallet(key);
console.log("DVM wallet address (fund this on Plasma + Coston2 for gas):");
console.log(wallet.address);
console.log("");
console.log("Plasma testnet: send XPL to this address");
console.log("Flare Coston2: send C2FLR to this address");
