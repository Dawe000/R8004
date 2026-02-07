import { ethers } from "ethers";

async function main() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic || mnemonic.trim().length === 0) {
    console.error("Set MNEMONIC in environment. Example:");
    console.error('  MNEMONIC="your twelve word mnemonic phrase" npm run print-addresses');
    process.exit(1);
  }

  const m = ethers.Mnemonic.fromPhrase(mnemonic.trim());
  const seed = m.computeSeed();
  const root = ethers.HDNodeWallet.fromSeed(seed);

  const accounts = [
    { label: "Deployer", path: "m/44'/60'/0'/0/0" },
    { label: "Client", path: "m/44'/60'/0'/0/1" },
    { label: "Agent", path: "m/44'/60'/0'/0/2" },
    { label: "MarketMaker", path: "m/44'/60'/0'/0/3" },
  ];

  console.log("Fund these addresses with XPL on Plasma testnet (chainId 9746):");
  console.log("");
  for (const { label, path } of accounts) {
    const derived = root.derivePath(path);
    console.log(`  ${label}: ${derived.address}`);
  }
  console.log("");
  console.log("RPC: https://testnet-rpc.plasma.to");
  console.log("Explorer: https://testnet.plasmascan.to");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
