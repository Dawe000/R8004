import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

const plasmaTestnet = defineChain({
  id: 9746,
  name: 'Plasma Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.plasma.to'] },
    public: { http: ['https://testnet-rpc.plasma.to'] },
  },
  blockExplorers: {
    default: { name: 'Plasma Explorer', url: 'https://testnet-explorer.plasma.to' },
  },
  testnet: true,
});

export const config = getDefaultConfig({
  appName: 'EthOxford Agents',
  projectId: 'a59037b8702f516c13be8975f7048277', 
  chains: [plasmaTestnet],
  ssr: true,
});