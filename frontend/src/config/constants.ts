// Network configurations
export const NETWORKS = {
  PLASMA: {
    chainId: 9746,
    escrowAddress: '0xEdF07E10E5Cf294d764AB85A4e8fC254D20bE03e',
    mockTokenAddress: '0xd201516E43fe79D176c2A48420685CAB9f87cF6C',
    mockOOv3Address: '0x4316125D2F7A6163607b44f948D977fd0dbCA8F3',
    deploymentBlock: 14650825,
  },
  COSTON2: {
    chainId: 114,
    escrowAddress: '0xA4E4C1772d3d2f604734609608009C46C5E32537',
    fxrpTokenAddress: '0x0b6A3645c240605887a5532109323A3E12273dc7',
    firelightVaultAddress: '0xe07484f61fc5C02464ceE533D7535D0b5a257f22',
    mockOOv3Address: '0x88E330931Eac139ef4C0a19797b682662a5B8C93',
    deploymentBlock: 26987203,
  },
} as const;

// Default to Coston2 (Firelight)
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
