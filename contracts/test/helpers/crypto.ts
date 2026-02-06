import { keccak256, solidityPacked, getBytes, toUtf8Bytes, type Wallet } from "ethers";

/**
 * Cryptographic utilities for tests - matches spec
 */

export function calculateResultHash(result: string | Uint8Array): string {
  const bytes = typeof result === "string" ? toUtf8Bytes(result) : result;
  return keccak256(bytes);
}

export async function signTaskResult(
  taskId: bigint,
  resultHash: string,
  signer: Wallet
): Promise<string> {
  const messageHash = keccak256(solidityPacked(["uint256", "bytes32"], [taskId, resultHash]));
  // EIP-191: signMessage adds prefix and signs (keccak256("\x19Ethereum Signed Message:\n32" + hash))
  const signature = await signer.signMessage(getBytes(messageHash));
  return signature;
}
