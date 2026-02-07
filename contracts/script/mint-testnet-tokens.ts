/**
 * Mint MockToken (testnet ERC20) to a recipient on Plasma testnet.
 * Run with an account that has some XPL for gas (e.g. from faucet).
 *
 * Usage:
 *   npx hardhat run script/mint-testnet-tokens.ts --network plasma-testnet
 *   RECIPIENT=0xYourAddress npx hardhat run script/mint-testnet-tokens.ts --network plasma-testnet
 *   AMOUNT=1000000 npx hardhat run script/mint-testnet-tokens.ts --network plasma-testnet
 */
import "dotenv/config";
import hre from "hardhat";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_RECIPIENT = "0xB4f985298E72886ce8Cff6B353325a2e3ad608A6";
const DEFAULT_AMOUNT = "1000000"; // 1M tokens (18 decimals)

async function main() {
  const recipient = (process.env.RECIPIENT ?? DEFAULT_RECIPIENT).trim();
  const amountStr = process.env.AMOUNT ?? DEFAULT_AMOUNT;
  const amount = ethers.parseEther(amountStr);

  const deploymentPath = path.join(
    process.cwd(),
    "deployments",
    "plasma-testnet.json"
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments/plasma-testnet.json not found");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenAddr =
    deployment?.contracts?.MockToken ?? deployment?.sdk?.mockTokenAddress;
  if (!tokenAddr) {
    throw new Error("MockToken address not found in deployment");
  }

  const [signer] = await hre.ethers.getSigners();
  if (!signer) {
    throw new Error(
      "No signer. Set MNEMONIC or DEPLOYER_PRIVATE_KEY in .env for plasma-testnet"
    );
  }

  const token = new ethers.Contract(
    tokenAddr,
    [
      "function mint(address to, uint256 amount) external",
      "function balanceOf(address) view returns (uint256)",
    ],
    signer
  );

  console.log("Plasma testnet – mint MockToken to recipient");
  console.log("  Token:", tokenAddr);
  console.log("  Recipient:", recipient);
  console.log("  Amount:", amountStr, "tokens");
  console.log("  Signer:", await signer.getAddress());

  const balanceBefore = await token.balanceOf(recipient);
  const tx = await token.mint(recipient, amount);
  console.log("  Tx hash:", tx.hash);
  await tx.wait();
  const balanceAfter = await token.balanceOf(recipient);
  console.log("  Recipient balance: %s -> %s", ethers.formatEther(balanceBefore), ethers.formatEther(balanceAfter));
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
