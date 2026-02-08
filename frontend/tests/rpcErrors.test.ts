import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRpcError } from '../src/lib/rpcErrors';

describe('rpc error classifier', () => {
  it('classifies rate-limited provider errors', () => {
    const error = new Error(
      'could not coalesce error (error={ "code": -32603, "message": "Request is being rate limited." })'
    );
    const classified = classifyRpcError(error);
    assert.equal(classified.kind, 'rate_limited');
    assert.match(classified.message, /rate-limited/i);
  });

  it('classifies wallet rejection', () => {
    const classified = classifyRpcError(new Error('User rejected the request'));
    assert.equal(classified.kind, 'user_rejected');
  });

  it('classifies insufficient funds and revert', () => {
    assert.equal(
      classifyRpcError(new Error('insufficient funds for intrinsic transaction cost')).kind,
      'insufficient_funds'
    );
    assert.equal(
      classifyRpcError(new Error('execution reverted: InvalidTaskStatus')).kind,
      'tx_reverted'
    );
  });

  it('falls back to unknown', () => {
    const classified = classifyRpcError({ random: 'value' });
    assert.equal(classified.kind, 'unknown');
    assert.match(classified.message, /random/i);
  });
});
