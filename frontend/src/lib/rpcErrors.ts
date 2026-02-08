export type RpcErrorKind =
  | 'rate_limited'
  | 'tx_reverted'
  | 'insufficient_funds'
  | 'user_rejected'
  | 'unknown';

export interface ClassifiedRpcError {
  kind: RpcErrorKind;
  message: string;
  rawMessage: string;
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function hasRateLimitSignal(raw: string): boolean {
  const normalized = raw.toLowerCase();
  return (
    normalized.includes('rate limited')
    || normalized.includes('rate limit')
    || normalized.includes('too many requests')
    || normalized.includes('429')
  );
}

export function classifyRpcError(error: unknown): ClassifiedRpcError {
  const rawMessage = toMessage(error);
  const normalized = rawMessage.toLowerCase();

  if (hasRateLimitSignal(rawMessage)) {
    return {
      kind: 'rate_limited',
      message: 'RPC is rate-limited. Retry in ~10-30s; background polling has been slowed automatically.',
      rawMessage,
    };
  }

  if (normalized.includes('user rejected') || normalized.includes('user denied')) {
    return {
      kind: 'user_rejected',
      message: 'Transaction rejected in wallet.',
      rawMessage,
    };
  }

  if (normalized.includes('insufficient funds')) {
    return {
      kind: 'insufficient_funds',
      message: 'Insufficient funds to cover gas or required token amount.',
      rawMessage,
    };
  }

  if (normalized.includes('execution reverted') || normalized.includes('call_exception')) {
    return {
      kind: 'tx_reverted',
      message: 'Transaction reverted on-chain. Verify task status, wallet, and timing window.',
      rawMessage,
    };
  }

  return {
    kind: 'unknown',
    message: rawMessage || 'Unknown RPC error.',
    rawMessage,
  };
}
