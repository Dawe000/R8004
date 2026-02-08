import type { OnchainTaskSpecV1 } from '@sdk/index';
import { AGENTS_BASE_URL } from '@/config/constants';

export interface Erc8001DirectDispatchRequest {
  agentId: string;
  chainId: number;
  onchainTaskId: string;
  stakeAmountWei: string;
  skill?: string;
  model?: string;
}

export interface Erc8001DirectDispatchResponse {
  agentId: string;
  runId: string;
  status: 'accepted';
  onchainTaskId: string;
  statusUrl?: string;
}

export interface Erc8001PaymentDepositedDirectRequest {
  agentId: string;
  chainId: number;
  onchainTaskId: string;
}

export async function getAgentCard(agentId: string) {
  const res = await fetch(`${AGENTS_BASE_URL}/${agentId}/card`);
  if (!res.ok) throw new Error('Failed to fetch agent');
  return res.json();
}

export async function createTaskSpecUri(spec: OnchainTaskSpecV1): Promise<string> {
  const res = await fetch('/api/ipfs/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });

  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }

  if (!res.ok) {
    const details =
      typeof body === 'object' && body !== null && 'details' in body
        ? String((body as { details?: unknown }).details)
        : text || `HTTP ${res.status}`;
    throw new Error(`Failed to pin task to IPFS (${res.status}): ${details}`);
  }

  const uri =
    typeof body === 'object' && body !== null && 'uri' in body
      ? String((body as { uri?: unknown }).uri || '')
      : '';
  if (!uri) {
    throw new Error('Failed to pin task to IPFS: missing URI');
  }
  return uri;
}

export async function dispatchErc8001TaskDirect(
  request: Erc8001DirectDispatchRequest
): Promise<Erc8001DirectDispatchResponse> {
  const payload = {
    task: {
      ...(request.skill ? { skill: request.skill } : {}),
      ...(request.model ? { model: request.model } : {}),
    },
    erc8001: {
      chainId: request.chainId,
      taskId: request.onchainTaskId,
      stakeAmountWei: request.stakeAmountWei,
      publicBaseUrl: AGENTS_BASE_URL,
    },
  };

  const res = await fetch(`${AGENTS_BASE_URL}/${request.agentId}/tasks?forceAsync=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to dispatch task to agent: ${res.status} ${text}`);
  }

  const body = (await res.json()) as { id?: string; statusUrl?: string };
  if (!body.id) {
    throw new Error('Agent dispatch response missing run id');
  }

  return {
    agentId: request.agentId,
    runId: body.id,
    status: 'accepted',
    onchainTaskId: request.onchainTaskId,
    statusUrl: body.statusUrl,
  };
}

export async function notifyErc8001PaymentDepositedDirect(
  request: Erc8001PaymentDepositedDirectRequest
): Promise<unknown> {
  const res = await fetch(`${AGENTS_BASE_URL}/${request.agentId}/erc8001/payment-deposited`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: request.chainId,
      onchainTaskId: request.onchainTaskId,
    }),
  });

  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errorMessage =
      typeof body === 'object' && body !== null && 'details' in body
        ? String((body as { details?: unknown }).details)
        : text || `HTTP ${res.status}`;
    throw new Error(`Payment notification failed (${res.status}): ${errorMessage}`);
  }

  return body;
}
