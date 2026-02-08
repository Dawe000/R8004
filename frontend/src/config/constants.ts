/**
 * Frontend config derived from SDK – single source of truth.
 * Network addresses (escrow, token, MockOOv3, etc.) come from @sdk/config.
 */
import {
  COSTON2_FIRELIGHT_DEFAULTS,
  PLASMA_TESTNET_DEFAULTS,
} from '@sdk/index';

export const NETWORKS = {
  PLASMA: {
    chainId: PLASMA_TESTNET_DEFAULTS.chainId,
    escrowAddress: PLASMA_TESTNET_DEFAULTS.escrowAddress,
    mockTokenAddress: PLASMA_TESTNET_DEFAULTS.mockTokenAddress,
    mockOOv3Address: PLASMA_TESTNET_DEFAULTS.mockOOv3Address,
    deploymentBlock: PLASMA_TESTNET_DEFAULTS.deploymentBlock,
    rpcUrl: PLASMA_TESTNET_DEFAULTS.rpcUrl,
  },
  COSTON2: {
    chainId: COSTON2_FIRELIGHT_DEFAULTS.chainId,
    escrowAddress: COSTON2_FIRELIGHT_DEFAULTS.escrowAddress,
    fxrpTokenAddress: COSTON2_FIRELIGHT_DEFAULTS.fxrpTokenAddress,
    yFXRPTokenAddress: COSTON2_FIRELIGHT_DEFAULTS.fFXRPVaultAddress,
    firelightVaultAddress: COSTON2_FIRELIGHT_DEFAULTS.fFXRPVaultAddress,
    mockOOv3Address: COSTON2_FIRELIGHT_DEFAULTS.mockOOv3Address,
    deploymentBlock: COSTON2_FIRELIGHT_DEFAULTS.deploymentBlock,
    rpcUrl: COSTON2_FIRELIGHT_DEFAULTS.rpcUrl,
  },
} as const;

export const DEFAULT_NETWORK = 'COSTON2';
export const ESCROW_ADDRESS = NETWORKS.COSTON2.escrowAddress;
export const MOCK_TOKEN_ADDRESS = NETWORKS.COSTON2.fxrpTokenAddress;
export const FIRELIGHT_VAULT_ADDRESS = NETWORKS.COSTON2.firelightVaultAddress;
export const MOCK_OOV3_ADDRESS = NETWORKS.COSTON2.mockOOv3Address;
export const DEPLOYMENT_BLOCK = NETWORKS.COSTON2.deploymentBlock.toString();

export const MARKET_MAKER_URL =
  process.env.NEXT_PUBLIC_MARKET_MAKER_URL ||
  'https://market-maker-agent.lynethlabs.workers.dev/api';

export const AGENTS_BASE_URL =
  process.env.NEXT_PUBLIC_AGENTS_BASE_URL ||
  'https://example-agent.lynethlabs.workers.dev';
