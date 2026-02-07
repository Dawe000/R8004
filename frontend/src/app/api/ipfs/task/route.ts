import { NextResponse } from 'next/server';
import { uploadJson } from '@sdk/ipfs';
import {
  ONCHAIN_TASK_SPEC_V1,
  parseOnchainTaskSpec,
  type OnchainTaskSpecV1,
} from '@sdk/index';

function resolveIpfsConfig() {
  const uriScheme: 'https' | 'ipfs' =
    process.env.IPFS_URI_SCHEME === 'https' ? 'https' : 'ipfs';

  if (process.env.PINATA_JWT) {
    return {
      provider: 'pinata' as const,
      apiKey: process.env.PINATA_JWT,
      uriScheme,
    };
  }

  if (process.env.NFT_STORAGE_API_KEY) {
    return {
      provider: 'nft.storage' as const,
      apiKey: process.env.NFT_STORAGE_API_KEY,
      uriScheme,
    };
  }

  if (process.env.IPFS_PROVIDER === 'mock') {
    return {
      provider: 'mock' as const,
      uriScheme,
    };
  }

  return null;
}

function normalizeSpec(input: unknown): OnchainTaskSpecV1 {
  const parsed = parseOnchainTaskSpec(input);
  if (parsed.version !== ONCHAIN_TASK_SPEC_V1) {
    throw new Error('Task spec must use version erc8001-task/v1 JSON schema');
  }

  const base = input as Partial<OnchainTaskSpecV1>;
  return {
    version: ONCHAIN_TASK_SPEC_V1,
    input: parsed.input,
    ...(typeof base.skill === 'string' && base.skill.trim() ? { skill: base.skill.trim() } : {}),
    ...(typeof base.model === 'string' && base.model.trim() ? { model: base.model.trim() } : {}),
    ...(typeof base.client === 'string' && base.client.trim() ? { client: base.client.trim() } : {}),
    ...(typeof base.createdAt === 'string' && base.createdAt.trim()
      ? { createdAt: base.createdAt.trim() }
      : {}),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const spec = normalizeSpec(body);
    const ipfsConfig = resolveIpfsConfig();

    if (!ipfsConfig) {
      return NextResponse.json(
        {
          error: 'IPFS configuration missing',
          details:
            'Set PINATA_JWT or NFT_STORAGE_API_KEY on the frontend server (or IPFS_PROVIDER=mock for local testing).',
        },
        { status: 500 }
      );
    }

    const uri = await uploadJson(spec, ipfsConfig);
    return NextResponse.json({ uri });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to pin task spec',
        details: message,
      },
      { status: 400 }
    );
  }
}
