/**
 * Integration tests - run against local Hardhat node with deployed sandbox.
 *
 * Setup:
 * 1. npx hardhat node (in contracts/)
 * 2. npx hardhat run script/deploy-sandbox.ts --network localhost (in contracts/)
 * 3. Set env: SDK_INTEGRATION_ESCROW, SDK_INTEGRATION_TOKEN, RPC_URL (default http://127.0.0.1:8545)
 * 4. Use default Hardhat accounts: account 1 = client, account 2 = agent
 *
 * Skip if SDK_INTEGRATION_ESCROW not set.
 */

import { ethers } from "ethers";
import { ClientSDK, AgentSDK } from "../src/index.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const ESCROW = process.env.SDK_INTEGRATION_ESCROW;
const TOKEN = process.env.SDK_INTEGRATION_TOKEN;

const MNEMONIC =
  "test test test test test test test test test test test junk";

function getSigner(index: number): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(RPC);
  const m = ethers.Mnemonic.fromPhrase(MNEMONIC);
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed());
  const derived = root.derivePath(`m/44'/60'/0'/0/${index}`);
  return derived.connect(provider);
}

const describeIntegration = ESCROW && TOKEN ? describe : describe.skip;

describeIntegration("SDK integration (Path A)", () => {
  let clientSdk: ClientSDK;
  let agentSdk: AgentSDK;
  let client: ethers.Wallet;
  let agent: ethers.Wallet;

  beforeAll(() => {
    client = getSigner(1);
    agent = getSigner(2);
    const config = {
      escrowAddress: ESCROW!,
      chainId: 31337,
      rpcUrl: RPC,
    };
    clientSdk = new ClientSDK(config, client);
    agentSdk = new AgentSDK(config, agent);
  });

  it("full Path A: create -> accept -> deposit -> assert -> settle", async () => {
    const paymentAmount = ethers.parseEther("100");
    const stakeAmount = ethers.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    const taskId = await clientSdk.createTask(
      "ipfs://description",
      TOKEN!,
      paymentAmount,
      deadline
    );
    expect(taskId).toBe(0n);

    await agentSdk.acceptTask(taskId, stakeAmount);
    await clientSdk.depositPayment(taskId);

    const result = "Task completed successfully";
    await agentSdk.assertCompletion(taskId, result);

    // Advance cooldown (60s in test config)
    const provider = agent.provider! as unknown as {
      send: (method: string, params: unknown[]) => Promise<unknown>;
    };
    await provider.send("evm_increaseTime", [61]);
    await provider.send("evm_mine", []);

    await agentSdk.settleNoContest(taskId);

    const tokenContract = new ethers.Contract(
      TOKEN!,
      ["function balanceOf(address) view returns (uint256)"],
      agent
    );
    const tokenBalance = await tokenContract.balanceOf(agent.address);
    expect(tokenBalance).toBe(
      ethers.parseEther("1000000") - stakeAmount + paymentAmount + stakeAmount
    );
  }, 30000);
});
