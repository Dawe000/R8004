import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ClientSDK, AgentSDK, getTokenAllowed } from "@erc8001/agent-task-sdk";
import { deployFixture } from "./helpers/fixtures";

describe("AgentTaskEscrow - SDK whitelist", function () {
  async function sdkFixture() {
    const f = await deployFixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const config = {
      escrowAddress: await f.escrow.getAddress(),
      chainId: Number(chainId),
    };
    const clientSdk = new ClientSDK(config, f.client);
    const agentSdk = new AgentSDK(config, f.agent);
    return { ...f, clientSdk, agentSdk };
  }

  it("clientSdk.isTokenAllowed returns true for whitelisted token", async function () {
    const { mockToken, clientSdk } = await loadFixture(sdkFixture);
    const tokenAddr = await mockToken.getAddress();
    const allowed = await clientSdk.isTokenAllowed(tokenAddr);
    expect(allowed).to.be.true;
  });

  it("clientSdk.isTokenAllowed returns false for non-whitelisted token", async function () {
    const { clientSdk } = await loadFixture(sdkFixture);
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const other = await MockERC20.deploy("Other", "OTH", 18);
    await other.waitForDeployment();
    const allowed = await clientSdk.isTokenAllowed(await other.getAddress());
    expect(allowed).to.be.false;
  });

  it("agentSdk.isTokenAllowed returns true for whitelisted token", async function () {
    const { mockToken, agentSdk } = await loadFixture(sdkFixture);
    const allowed = await agentSdk.isTokenAllowed(await mockToken.getAddress());
    expect(allowed).to.be.true;
  });

  it("getTokenAllowed(escrow, provider, token) returns correct result", async function () {
    const { escrow, mockToken, client } = await loadFixture(sdkFixture);
    const provider = client.provider!;
    const escrowAddr = await escrow.getAddress();
    const tokenAddr = await mockToken.getAddress();

    const allowedWhitelisted = await getTokenAllowed(escrowAddr, provider, tokenAddr);
    expect(allowedWhitelisted).to.be.true;

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const other = await MockERC20.deploy("Other", "OTH", 18);
    await other.waitForDeployment();
    const allowedOther = await getTokenAllowed(escrowAddr, provider, await other.getAddress());
    expect(allowedOther).to.be.false;
  });

  it("createTask throws when payment token is not allowed", async function () {
    const { clientSdk } = await loadFixture(sdkFixture);
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const other = await MockERC20.deploy("Other", "OTH", 18);
    await other.waitForDeployment();
    const paymentAmount = ethers.parseEther("100");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await expect(
      clientSdk.createTask(
        "ipfs://desc",
        await other.getAddress(),
        paymentAmount,
        deadline
      )
    ).to.be.rejectedWith(Error, /Payment token is not allowed/);
  });

  it("createTask throws when stake token is not allowed", async function () {
    const { mockToken, clientSdk } = await loadFixture(sdkFixture);
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const other = await MockERC20.deploy("Other", "OTH", 18);
    await other.waitForDeployment();
    const paymentAmount = ethers.parseEther("100");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    const paymentAddr = await mockToken.getAddress();
    const stakeAddr = await other.getAddress();

    await expect(
      clientSdk.createTask(
        "ipfs://desc",
        paymentAddr,
        paymentAmount,
        deadline,
        stakeAddr
      )
    ).to.be.rejectedWith(Error, /Stake token is not allowed/);
  });
});
