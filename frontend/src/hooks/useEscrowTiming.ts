'use client';

import { useCallback, useEffect, useState } from 'react';
import { useChainId } from 'wagmi';
import {
  COSTON2_FIRELIGHT_DEFAULTS,
  getEscrowConfig,
  PLASMA_TESTNET_DEFAULTS,
} from '@sdk/index';
import { useEthersProvider } from '@/lib/ethers';

interface EscrowTimingState {
  agentResponseWindowSec: bigint | null;
  disputeBondBps: bigint | null;
  isLoading: boolean;
  error: string | null;
}

export function useEscrowTiming() {
  const chainId = useChainId();
  const provider = useEthersProvider({ chainId });
  const escrowAddress = chainId === PLASMA_TESTNET_DEFAULTS.chainId
    ? PLASMA_TESTNET_DEFAULTS.escrowAddress
    : COSTON2_FIRELIGHT_DEFAULTS.escrowAddress;
  const [state, setState] = useState<EscrowTimingState>({
    agentResponseWindowSec: null,
    disputeBondBps: null,
    isLoading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!provider) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const config = await getEscrowConfig(escrowAddress, provider);
      setState({
        agentResponseWindowSec: config.agentResponseWindow,
        disputeBondBps: config.disputeBondBps,
        isLoading: false,
        error: null,
      });
    } catch (error: unknown) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load escrow timing',
      }));
    }
  }, [provider, escrowAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}
