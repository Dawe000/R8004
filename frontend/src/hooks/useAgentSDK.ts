import { useMemo } from 'react';
import { useEthersSigner } from '@/lib/ethers';
import {
  ClientSDK,
  AgentSDK,
  getCoston2FirelightConfig,
  getPlasmaTestnetConfig
} from '@sdk/index';
import { MARKET_MAKER_URL } from '@/config/constants';
import { useChainId } from 'wagmi';

export function useAgentSDK() {
  const signer = useEthersSigner();
  const chainId = useChainId();

  const sdk = useMemo(() => {
    if (!signer) return null;

    // Auto-detect network based on chainId
    const config = chainId === 114
      ? getCoston2FirelightConfig({
          chainId: chainId,
          marketMakerUrl: MARKET_MAKER_URL,
          ipfs: {
            provider: 'mock' as const,
            uriScheme: 'ipfs' as const,
          },
        })
      : getPlasmaTestnetConfig({
          chainId: chainId,
          marketMakerUrl: MARKET_MAKER_URL,
          ipfs: {
            provider: 'mock' as const,
            uriScheme: 'ipfs' as const,
          },
        });

    return {
      client: new ClientSDK(config, signer),
      agent: new AgentSDK(config, signer),
    };
  }, [signer, chainId]);

  return sdk;
}
