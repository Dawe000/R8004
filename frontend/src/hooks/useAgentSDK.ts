import { useMemo } from 'react';
import { useEthersSigner } from '@/lib/ethers';
import { ClientSDK, AgentSDK } from '@sdk/index';
import { ESCROW_ADDRESS, MARKET_MAKER_URL, DEPLOYMENT_BLOCK } from '@/config/constants';
import { useChainId } from 'wagmi';

export function useAgentSDK() {
  const signer = useEthersSigner();
  const chainId = useChainId();

  const sdk = useMemo(() => {
    if (!signer) return null;

    const config = {
      escrowAddress: ESCROW_ADDRESS,
      chainId: chainId,
      marketMakerUrl: MARKET_MAKER_URL,
      deploymentBlock: DEPLOYMENT_BLOCK,
      ipfs: {
        provider: 'mock' as const,
        uriScheme: 'ipfs' as const,
      },
    };

    return {
      client: new ClientSDK(config, signer),
      agent: new AgentSDK(config, signer),
    };
  }, [signer, chainId]);

  return sdk;
}
