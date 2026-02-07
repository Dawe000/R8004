import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/ipfs/task/route';

const ENV_KEYS = ['PINATA_JWT', 'NFT_STORAGE_API_KEY', 'IPFS_PROVIDER', 'IPFS_URI_SCHEME'] as const;

let previousEnv: Record<string, string | undefined> = {};

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const value = overrides[key];
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('/api/ipfs/task route', () => {
  beforeEach(() => {
    previousEnv = {};
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previousEnv[key];
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('pins a valid v1 task spec with mock provider', async () => {
    setEnv({ IPFS_PROVIDER: 'mock' });
    const request = new Request('http://localhost/api/ipfs/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'erc8001-task/v1',
        input: 'Plan a route to Oxford',
        skill: 'travel',
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { uri: string };
    assert.match(body.uri, /^ipfs:\/\/mock[0-9a-f]+$/);
  });

  it('supports https URI scheme when configured', async () => {
    setEnv({ IPFS_PROVIDER: 'mock', IPFS_URI_SCHEME: 'https' });
    const request = new Request('http://localhost/api/ipfs/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'erc8001-task/v1',
        input: 'Use https URI scheme',
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { uri: string };
    assert.match(body.uri, /^https:\/\/ipfs\.io\/ipfs\/mock[0-9a-f]+$/);
  });

  it('returns 400 for plain-text payload instead of v1 schema', async () => {
    setEnv({ IPFS_PROVIDER: 'mock' });
    const request = new Request('http://localhost/api/ipfs/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('raw prompt text'),
    });

    const response = await POST(request);
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; details: string };
    assert.equal(body.error, 'Failed to pin task spec');
    assert.match(body.details, /erc8001-task\/v1/i);
  });

  it('returns 500 when no IPFS provider secret/config is set', async () => {
    const request = new Request('http://localhost/api/ipfs/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'erc8001-task/v1',
        input: 'No provider configured',
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: string; details: string };
    assert.equal(body.error, 'IPFS configuration missing');
    assert.match(body.details, /PINATA_JWT|NFT_STORAGE_API_KEY/i);
  });
});
