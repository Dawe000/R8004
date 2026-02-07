import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixtureWithAllowedTokens } from "./helpers/fixtures";

describe("AgentTaskEscrow - Token whitelist", function () {
  it("createTask reverts when paymentToken is not whitelisted", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    await tokenA.waitForDeployment();
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);
    await tokenB.waitForDeployment();

    const { escrow, client } = await deployFixtureWithAllowedTokens([
      await tokenA.getAddress(),
    ]);

    const paymentAmount = ethers.parseEther("100");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await expect(
      escrow.connect(client).createTask(
        "ipfs://desc",
        await tokenB.getAddress(),
        paymentAmount,
        deadline,
        ethers.ZeroAddress
      )
    ).to.be.revertedWithCustomError(escrow, "TokenNotAllowed").withArgs(await tokenB.getAddress());
  });

  it("createTask reverts when stakeToken is not whitelisted", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    await tokenA.waitForDeployment();
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);
    await tokenB.waitForDeployment();

    const { escrow, client } = await deployFixtureWithAllowedTokens([
      await tokenA.getAddress(),
    ]);

    const paymentAmount = ethers.parseEther("100");
    const deadline = Math.floor(Date.now() / 1000) + 86400;

    await expect(
      escrow.connect(client).createTask(
        "ipfs://desc",
        await tokenA.getAddress(),
        paymentAmount,
        deadline,
        await tokenB.getAddress()
      )
    ).to.be.revertedWithCustomError(escrow, "TokenNotAllowed").withArgs(await tokenB.getAddress());
  });

  it("owner can add and remove allowed tokens", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    await tokenA.waitForDeployment();
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);
    await tokenB.waitForDeployment();

    const [owner, client] = await ethers.getSigners();
    const { escrow } = await deployFixtureWithAllowedTokens([await tokenA.getAddress()]);

    expect(await escrow.allowedTokens(await tokenA.getAddress())).to.be.true;
    expect(await escrow.allowedTokens(await tokenB.getAddress())).to.be.false;

    await escrow.connect(owner).addAllowedToken(await tokenB.getAddress());
    expect(await escrow.allowedTokens(await tokenB.getAddress())).to.be.true;

    await escrow.connect(owner).removeAllowedToken(await tokenA.getAddress());
    expect(await escrow.allowedTokens(await tokenA.getAddress())).to.be.false;
  });

  it("non-owner cannot add or remove allowed tokens", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    await tokenA.waitForDeployment();
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);
    await tokenB.waitForDeployment();

    const [, , client] = await ethers.getSigners();
    const { escrow } = await deployFixtureWithAllowedTokens([await tokenA.getAddress()]);

    await expect(
      escrow.connect(client).addAllowedToken(await tokenB.getAddress())
    ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount").withArgs(await client.getAddress());

    await expect(
      escrow.connect(client).removeAllowedToken(await tokenA.getAddress())
    ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount").withArgs(await client.getAddress());
  });
});
