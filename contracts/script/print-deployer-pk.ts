/**
 * Print deployer (account 0) private key for DVM_PRIVATE_KEY.
 * Run: MNEMONIC="..." npx tsx script/print-deployer-pk.ts
 * Or: npx tsx script/print-deployer-pk.ts  (reads MNEMONIC from .env)
 */
import "dotenv/config";
import { ethers } from "ethers";

const mnemonic = process.env.MNEMONIC;
if (!mnemonic?.trim()) {
  console.error("Set MNEMONIC in .env or env. Example:");
  console.error('  MNEMONIC="your twelve word mnemonic" npx tsx script/print-deployer-pk.ts');
  process.exit(1);
}

// ethers.Wallet.fromPhrase() uses m/44'/60'/0'/0/0 (account 0) by default
const wallet = ethers.Wallet.fromPhrase(mnemonic.trim());
console.log("Private key (Deployer / DVM):");
console.log(wallet.privateKey);
