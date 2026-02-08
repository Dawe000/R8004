import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTaskDispatchMeta,
  TASK_DISPATCH_META_KEY,
  upsertTaskDispatchMeta,
} from '../frontend/src/lib/taskMeta.ts';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

function installStorage() {
  const storage = new MemoryStorage();
  global.window = {};
  global.localStorage = storage;
  return storage;
}

describe('frontend task dispatch metadata', () => {
  beforeEach(() => {
    installStorage();
  });

  it('stores and reads chain-scoped task metadata', () => {
    upsertTaskDispatchMeta(9746, '101', {
      agentId: '1',
      runId: 'run-101',
    });

    const meta = getTaskDispatchMeta(9746, '101');
    assert.equal(meta?.agentId, '1');
    assert.equal(meta?.runId, 'run-101');
    assert.ok(meta?.updatedAt);

    const raw = JSON.parse(global.localStorage.getItem(TASK_DISPATCH_META_KEY));
    assert.equal(raw['9746:101'].agentId, '1');
  });

  it('avoids collisions for same task ID across chains', () => {
    upsertTaskDispatchMeta(9746, '42', {
      agentId: 'plasma-agent',
      runId: 'plasma-run',
    });
    upsertTaskDispatchMeta(114, '42', {
      agentId: 'flare-agent',
      runId: 'flare-run',
    });

    const plasma = getTaskDispatchMeta(9746, '42');
    const flare = getTaskDispatchMeta(114, '42');

    assert.equal(plasma?.agentId, 'plasma-agent');
    assert.equal(flare?.agentId, 'flare-agent');
    assert.notEqual(plasma?.runId, flare?.runId);
  });

  it('falls back to legacy key when present', () => {
    global.localStorage.setItem(
      TASK_DISPATCH_META_KEY,
      JSON.stringify({
        '88': {
          agentId: 'legacy-agent',
          runId: 'legacy-run',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      })
    );

    let warned = false;
    const originalWarn = console.warn;
    console.warn = () => {
      warned = true;
    };

    try {
      const meta = getTaskDispatchMeta(114, '88');
      assert.equal(meta?.agentId, 'legacy-agent');
      assert.equal(meta?.runId, 'legacy-run');
      assert.equal(warned, true);
    } finally {
      console.warn = originalWarn;
    }
  });
});
