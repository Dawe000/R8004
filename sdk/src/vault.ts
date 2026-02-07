/**
 * Firelight Vault helpers for agents to manage FXRP ↔ fFXRP independently
 * Agents deposit FXRP to earn yield, then stake fFXRP shares as collateral
 */

import { Contract, Signer } from "ethers";
import { ensureAllowance } from "./contract";

const ERC4626_ABI = [
  "function asset() external view returns (address)",
  "function deposit(uint256 assets, address receiver) external returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address owner) external returns (uint256)",
  "function redeem(uint256 shares, address receiver, address owner) external returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function convertToShares(uint256 assets) external view returns (uint256)",
  "function maxWithdraw(address owner) external view returns (uint256)",
  "function previewDeposit(uint256 assets) external view returns (uint256)",
  "function previewRedeem(uint256 shares) external view returns (uint256)",
];

/**
 * Deposit FXRP into Firelight Vault → receive fFXRP shares
 * @param vaultAddress Firelight Vault address (0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B on Coston2)
 * @param fxrpAddress FXRP token address
 * @param signer Agent's signer
 * @param fxrpAmount Amount of FXRP to deposit
 * @returns fFXRP shares received
 */
export async function depositToVault(
  vaultAddress: string,
  fxrpAddress: string,
  signer: Signer,
  fxrpAmount: bigint
): Promise<bigint> {
  const vault = new Contract(vaultAddress, ERC4626_ABI, signer);
  const agentAddress = await signer.getAddress();

  // Approve vault to spend FXRP
  await ensureAllowance(fxrpAddress, signer, vaultAddress, fxrpAmount);

  // Deposit and receive fFXRP shares
  const tx = await vault.deposit(fxrpAmount, agentAddress);
  await tx.wait();

  // Return new fFXRP balance
  const fFXRPBalance = await vault.balanceOf(agentAddress);
  return fFXRPBalance;
}

/**
 * Withdraw FXRP from Firelight Vault → burn fFXRP shares
 * @param vaultAddress Firelight Vault address
 * @param signer Agent's signer
 * @param fxrpAmount Amount of FXRP to withdraw (NOT shares)
 * @returns fFXRP shares burned
 */
export async function withdrawFromVault(
  vaultAddress: string,
  signer: Signer,
  fxrpAmount: bigint
): Promise<bigint> {
  const vault = new Contract(vaultAddress, ERC4626_ABI, signer);
  const agentAddress = await signer.getAddress();

  // Withdraw FXRP by specifying asset amount
  const tx = await vault.withdraw(fxrpAmount, agentAddress, agentAddress);
  const receipt = await tx.wait();

  // Calculate shares burned from events or preview
  const sharesBurned = await vault.convertToShares(fxrpAmount);
  return sharesBurned;
}

/**
 * Redeem fFXRP shares → receive FXRP
 * @param vaultAddress Firelight Vault address
 * @param signer Agent's signer
 * @param fFXRPShares Amount of fFXRP shares to redeem
 * @returns FXRP received
 */
export async function redeemFromVault(
  vaultAddress: string,
  signer: Signer,
  fFXRPShares: bigint
): Promise<bigint> {
  const vault = new Contract(vaultAddress, ERC4626_ABI, signer);
  const agentAddress = await signer.getAddress();

  // Redeem shares for FXRP
  const tx = await vault.redeem(fFXRPShares, agentAddress, agentAddress);
  await tx.wait();

  // Return FXRP amount received (could be higher than original deposit due to yield)
  const fxrpReceived = await vault.convertToAssets(fFXRPShares);
  return fxrpReceived;
}

/**
 * Get agent's fFXRP balance (vault shares)
 */
export async function getVaultShareBalance(
  vaultAddress: string,
  signer: Signer
): Promise<bigint> {
  const vault = new Contract(vaultAddress, ERC4626_ABI, signer);
  const agentAddress = await signer.getAddress();
  return await vault.balanceOf(agentAddress);
}

/**
 * Get current exchange rate: how much FXRP is 1 fFXRP worth?
 * @returns FXRP per fFXRP share (scaled by 1e18)
 */
export async function getVaultExchangeRate(
  vaultAddress: string,
  signer: Signer
): Promise<bigint> {
  const vault = new Contract(vaultAddress, ERC4626_ABI, signer);
  const oneShare = BigInt(1e18); // 1 fFXRP
  const fxrpPerShare = await vault.convertToAssets(oneShare);
  return fxrpPerShare;
}

/**
 * Preview how many fFXRP shares you'll get for depositing FXRP
 */
export async function previewDeposit(
  vaultAddress: string,
  signer: Signer,
  fxrpAmount: bigint
): Promise<bigint> {
  const vault = new Contract(vaultAddress, ERC4626_ABI, signer);
  return await vault.previewDeposit(fxrpAmount);
}

/**
 * Preview how much FXRP you'll get for redeeming fFXRP shares
 */
export async function previewRedeem(
  vaultAddress: string,
  signer: Signer,
  fFXRPShares: bigint
): Promise<bigint> {
  const vault = new Contract(vaultAddress, ERC4626_ABI, signer);
  return await vault.previewRedeem(fFXRPShares);
}
