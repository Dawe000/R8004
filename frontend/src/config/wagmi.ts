import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

const plasmaTestnet = defineChain({
  id: 9746,
  name: 'Plasma Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.plasma.to'] },
    public: { http: ['https://testnet-rpc.plasma.to'] },
  },
  blockExplorers: {
    default: {
      name: 'Plasma Explorer',
      url: 'https://testnet-explorer.plasma.to'
    },
  },
  testnet: true,
});

const flareCoston2 = defineChain({
  id: 114,
  name: 'Flare Coston2 Testnet',
  nativeCurrency: { name: 'C2FLR', symbol: 'C2FLR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://coston2-api.flare.network/ext/C/rpc'] },
    public: { http: ['https://coston2-api.flare.network/ext/C/rpc'] },
  },
  blockExplorers: {
    default: {
      name: 'Flare Coston2 Explorer',
      url: 'https://coston2-explorer.flare.network'
    },
  },
  testnet: true,
});

export const config = getDefaultConfig({
  appName: 'R8004',
  projectId: 'a59037b8702f516c13be8975f7048277',
  chains: [flareCoston2, plasmaTestnet],
  ssr: true,
});