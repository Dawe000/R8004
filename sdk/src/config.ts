/**
 * SDK configuration
 */

/** Default Plasma testnet (chainId 9746) deployment addresses */
export const PLASMA_TESTNET_DEFAULTS = {
  escrowAddress: "0x058Cdf041A8911687D3941430F7fd641134C245C" as const,
  mockTokenAddress: "0xdA085435a4a74e15e6CbF6dc3c9F89E9D6aD1C27" as const,
  mockOOv3Address: "0x5CA6175c0a5ec4ce61416E49fe69e3B91B4Ba310" as const,
  chainId: 9746,
  rpcUrl: "https://testnet-rpc.plasma.to",
  /** Escrow deployment block - used to limit eth_getLogs range on RPCs with 10k block limit (Plasma) */
  deploymentBlock: 14612077,
} as const;

export interface IpfsConfig {
  provider: "pinata" | "nft.storage" | "mock";
  /** Not required for mock provider */
  apiKey?: string;
  /** Return ipfs:// or https:// gateway URL (default: ipfs://) */
  uriScheme?: "ipfs" | "https";
}

export interface SDKConfig {
  /** AgentTaskEscrow contract address */
  escrowAddress: string;
  /** Chain ID */
  chainId: number;
  /** RPC URL - optional if provider/signer already has one */
  rpcUrl?: string;
  /** Market maker API base URL (e.g. https://market-maker-agent..../api) */
  marketMakerUrl?: string;
  /** IPFS pinning config - required for createTask with spec, disputeTask, escalateToUMA */
  ipfs?: IpfsConfig;
  /** Escrow deployment block - limits eth_getLogs fromBlock on RPCs with 10k block limit (e.g. Plasma) */
  deploymentBlock?: number | bigint;
}

/** Default IPFS URI scheme */
export const DEFAULT_IPFS_URI_SCHEME = "ipfs" as const;

/**
 * Get Plasma testnet config with optional overrides.
 * Env overrides: ESCROW_ADDRESS, RPC_URL, CHAIN_ID, MOCK_TOKEN_ADDRESS.
 * Explicit overrides take precedence over env.
 */
export function getPlasmaTestnetConfig(
  overrides?: Partial<
    SDKConfig & { mockTokenAddress?: string; mockOOv3Address?: string; deploymentBlock?: number | bigint }
  >
): SDKConfig & { mockTokenAddress: string; mockOOv3Address: string } {
  const fromEnv = {
    escrowAddress: process.env.ESCROW_ADDRESS,
    rpcUrl: process.env.RPC_URL,
    chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : undefined,
    mockTokenAddress: process.env.MOCK_TOKEN_ADDRESS,
    mockOOv3Address: process.env.MOCK_OOv3_ADDRESS,
    deploymentBlock: process.env.DEPLOYMENT_BLOCK
      ? parseInt(process.env.DEPLOYMENT_BLOCK, 10)
      : undefined,
  };
  return {
    escrowAddress:
      overrides?.escrowAddress ??
      fromEnv.escrowAddress ??
      PLASMA_TESTNET_DEFAULTS.escrowAddress,
    chainId:
      overrides?.chainId ??
      (fromEnv.chainId ?? PLASMA_TESTNET_DEFAULTS.chainId),
    rpcUrl:
      overrides?.rpcUrl ?? fromEnv.rpcUrl ?? PLASMA_TESTNET_DEFAULTS.rpcUrl,
    ...(overrides?.marketMakerUrl !== undefined && {
      marketMakerUrl: overrides.marketMakerUrl,
    }),
    ...(overrides?.ipfs !== undefined && { ipfs: overrides.ipfs }),
    mockTokenAddress:
      overrides?.mockTokenAddress ??
      fromEnv.mockTokenAddress ??
      PLASMA_TESTNET_DEFAULTS.mockTokenAddress,
    mockOOv3Address:
      overrides?.mockOOv3Address ??
      fromEnv.mockOOv3Address ??
      PLASMA_TESTNET_DEFAULTS.mockOOv3Address,
    deploymentBlock:
      overrides?.deploymentBlock ??
      fromEnv.deploymentBlock ??
      PLASMA_TESTNET_DEFAULTS.deploymentBlock,
  };
}
