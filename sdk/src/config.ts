/**
 * SDK configuration
 */

/** Default Plasma testnet (chainId 9746) deployment addresses */
export const PLASMA_TESTNET_DEFAULTS = {
  escrowAddress: "0x2E24A0a838Fa71765A00CB9528B6C378D8437D53" as const,
  mockTokenAddress: "0xd201516E43fe79D176c2A48420685CAB9f87cF6C" as const,
  mockOOv3Address: "0x4316125D2F7A6163607b44f948D977fd0dbCA8F3" as const,
  chainId: 9746,
  rpcUrl: "https://testnet-rpc.plasma.to",
  /** Escrow deployment block - used to limit eth_getLogs range on RPCs with 10k block limit (Plasma) */
  deploymentBlock: 14650825,
} as const;

/** Default Coston2 testnet (chainId 114) deployment addresses for Firelight integration */
export const COSTON2_FIRELIGHT_DEFAULTS = {
  escrowAddress: "0xA4E4C1772d3d2f604734609608009C46C5E32537" as const,
  fxrpTokenAddress: "0x0b6A3645c240605887a5532109323A3E12273dc7" as const,
  fFXRPVaultAddress: "0x91Bfe6A68aB035DFebb6A770FFfB748C03C0E40B" as const,
  mockOOv3Address: "0x88E330931Eac139ef4C0a19797b682662a5B8C93" as const,
  chainId: 114,
  rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
  deploymentBlock: 26987203,
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

export interface FirelightSDKConfig extends SDKConfig {
  fxrpTokenAddress: string;
  fFXRPVaultAddress: string;
}

/**
 * Get Coston2 Firelight config with optional overrides.
 * Env overrides: ESCROW_ADDRESS, RPC_URL, CHAIN_ID, FXRP_TOKEN_ADDRESS, FIRELIGHT_VAULT_ADDRESS.
 * Explicit overrides take precedence over env.
 */
export function getCoston2FirelightConfig(
  overrides?: Partial<FirelightSDKConfig & { mockOOv3Address?: string; deploymentBlock?: number | bigint }>
): FirelightSDKConfig & { mockOOv3Address: string } {
  const fromEnv = {
    escrowAddress: process.env.ESCROW_ADDRESS,
    rpcUrl: process.env.RPC_URL,
    chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : undefined,
    fxrpTokenAddress: process.env.FXRP_TOKEN_ADDRESS,
    fFXRPVaultAddress: process.env.FIRELIGHT_VAULT_ADDRESS,
    mockOOv3Address: process.env.MOCK_OOv3_ADDRESS,
    deploymentBlock: process.env.DEPLOYMENT_BLOCK
      ? parseInt(process.env.DEPLOYMENT_BLOCK, 10)
      : undefined,
  };
  return {
    escrowAddress:
      overrides?.escrowAddress ??
      fromEnv.escrowAddress ??
      COSTON2_FIRELIGHT_DEFAULTS.escrowAddress,
    chainId:
      overrides?.chainId ??
      (fromEnv.chainId ?? COSTON2_FIRELIGHT_DEFAULTS.chainId),
    rpcUrl:
      overrides?.rpcUrl ?? fromEnv.rpcUrl ?? COSTON2_FIRELIGHT_DEFAULTS.rpcUrl,
    ...(overrides?.marketMakerUrl !== undefined && {
      marketMakerUrl: overrides.marketMakerUrl,
    }),
    ...(overrides?.ipfs !== undefined && { ipfs: overrides.ipfs }),
    fxrpTokenAddress:
      overrides?.fxrpTokenAddress ??
      fromEnv.fxrpTokenAddress ??
      COSTON2_FIRELIGHT_DEFAULTS.fxrpTokenAddress,
    fFXRPVaultAddress:
      overrides?.fFXRPVaultAddress ??
      fromEnv.fFXRPVaultAddress ??
      COSTON2_FIRELIGHT_DEFAULTS.fFXRPVaultAddress,
    mockOOv3Address:
      overrides?.mockOOv3Address ??
      fromEnv.mockOOv3Address ??
      COSTON2_FIRELIGHT_DEFAULTS.mockOOv3Address,
    deploymentBlock:
      overrides?.deploymentBlock ??
      fromEnv.deploymentBlock ??
      COSTON2_FIRELIGHT_DEFAULTS.deploymentBlock,
  };
}
