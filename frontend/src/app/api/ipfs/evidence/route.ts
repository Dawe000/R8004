import { NextResponse } from 'next/server';
import { uploadJson } from '@sdk/ipfs';

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

/** Request body: { reason: string } – client dispute evidence (uploaded to IPFS). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { reason?: string; text?: string };
    const reason = typeof body?.reason === 'string' ? body.reason : typeof body?.text === 'string' ? body.text : '';
    const payload = {
      reason: reason.trim() || 'Client disputes task result.',
      timestamp: new Date().toISOString(),
    };

    const ipfsConfig = resolveIpfsConfig();
    if (!ipfsConfig) {
      return NextResponse.json(
        {
          error: 'IPFS configuration missing',
          details:
            'Set PINATA_JWT or NFT_STORAGE_API_KEY on the server (or IPFS_PROVIDER=mock for local testing).',
        },
        { status: 500 }
      );
    }

    const uri = await uploadJson(payload, ipfsConfig);
    return NextResponse.json({ uri });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to upload evidence to IPFS', details: message },
      { status: 400 }
    );
  }
}
