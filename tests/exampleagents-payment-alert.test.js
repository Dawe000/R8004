import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://agents.test';

function req(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const headers = {};
  const init = { method, headers };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

class FakeD1 {
  constructor() {
    this.tasks = new Map();
  }

  prepare(sql) {
    const compact = sql.replace(/\s+/g, ' ').trim();
    const db = this;
    let args = [];

    return {
      bind(...values) {
        args = values;
        return this;
      },

      async run() {
        if (compact.startsWith('INSERT INTO tasks')) {
          const [
            id,
            agentId,
            channel,
            status,
            requestPayloadJson,
            inputText,
            skillId,
            modelRequested,
            modelUsed,
            resultJson,
            errorMessage,
            responseMetaJson,
            createdAt,
            startedAt,
            completedAt,
            updatedAt,
            expiresAt,
          ] = args;

          db.tasks.set(id, {
            id,
            agent_id: agentId,
            channel,
            status,
            request_payload_json: requestPayloadJson,
            input_text: inputText,
            skill_id: skillId,
            model_requested: modelRequested,
            model_used: modelUsed,
            result_json: resultJson,
            error_message: errorMessage,
            response_meta_json: responseMetaJson,
            created_at: createdAt,
            started_at: startedAt,
            completed_at: completedAt,
            updated_at: updatedAt,
            expires_at: expiresAt,
          });
          return { meta: { changes: 1 } };
        }

        if (compact.startsWith('UPDATE tasks SET status = ?, started_at = COALESCE')) {
          const [status, startedAt, updatedAt, taskId] = args;
          const row = db.tasks.get(taskId);
          if (!row) return { meta: { changes: 0 } };
          row.status = status;
          row.started_at = row.started_at || startedAt;
          row.updated_at = updatedAt;
          row.error_message = null;
          return { meta: { changes: 1 } };
        }

        if (compact.startsWith('UPDATE tasks SET response_meta_json = ?, updated_at = ?')) {
          const [responseMetaJson, updatedAt, taskId] = args;
          const row = db.tasks.get(taskId);
          if (!row) return { meta: { changes: 0 } };
          row.response_meta_json = responseMetaJson;
          row.updated_at = updatedAt;
          return { meta: { changes: 1 } };
        }

        throw new Error(`Unsupported run query in FakeD1: ${compact}`);
      },

      async first() {
        if (compact.startsWith('SELECT * FROM tasks WHERE id = ? LIMIT 1')) {
          return db.tasks.get(args[0]) || null;
        }
        throw new Error(`Unsupported first query in FakeD1: ${compact}`);
      },

      async all() {
        if (compact.includes('SELECT * FROM tasks WHERE agent_id = ?')) {
          const [agentId, limit] = args;
          const rows = [...db.tasks.values()]
            .filter((row) => row.agent_id === agentId)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, Number(limit || 500));
          return { results: rows };
        }
        throw new Error(`Unsupported all query in FakeD1: ${compact}`);
      },
    };
  }
}

async function loadWorker() {
  const mod = await import('../exampleagents/example-agents-worker.js');
  return mod.default;
}

async function createErcTask(worker, env, onchainTaskId, chainId = null) {
  const erc8001Payload = {
    taskId: onchainTaskId,
    stakeAmountWei: '1',
    publicBaseUrl: BASE_URL,
    ...(chainId !== null ? { chainId } : {}),
  };
  const createRes = await worker.fetch(
    req('POST', '/1/tasks?forceAsync=true', {
      task: {
        input: 'example task input',
      },
      erc8001: erc8001Payload,
    }),
    env,
    {}
  );
  assert.equal(createRes.status, 202);
  return createRes.json();
}

describe('exampleagents payment-deposited route', () => {
  it('returns 400 when onchainTaskId is missing', async () => {
    const worker = await loadWorker();
    const env = { DB: new FakeD1(), TASK_EXEC_QUEUE: { send: async () => {} } };
    const res = await worker.fetch(
      req('POST', '/1/erc8001/payment-deposited', {}),
      env,
      {}
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid payload');
  });

  it('returns 404 when no matching task run exists', async () => {
    const worker = await loadWorker();
    const env = { DB: new FakeD1(), TASK_EXEC_QUEUE: { send: async () => {} } };
    const res = await worker.fetch(
      req('POST', '/1/erc8001/payment-deposited', { onchainTaskId: '999' }),
      env,
      {}
    );
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'No matching task run found');
  });

  it('returns 200 no-op when task is not awaiting payment alert', async () => {
    const worker = await loadWorker();
    const env = { DB: new FakeD1(), TASK_EXEC_QUEUE: { send: async () => {} } };
    const created = await createErcTask(worker, env, '12345');

    const res = await worker.fetch(
      req('POST', '/1/erc8001/payment-deposited', { onchainTaskId: '12345' }),
      env,
      {}
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'no-op');
    assert.equal(body.taskId, created.id);
  });

  it('returns 200 no-op for terminal tasks', async () => {
    const worker = await loadWorker();
    const db = new FakeD1();
    const env = { DB: db, TASK_EXEC_QUEUE: { send: async () => {} } };
    const created = await createErcTask(worker, env, '777');
    const row = db.tasks.get(created.id);
    row.status = 'completed';

    const res = await worker.fetch(
      req('POST', '/1/erc8001/payment-deposited', { onchainTaskId: '777' }),
      env,
      {}
    );

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'no-op');
    assert.equal(body.taskStatus, 'completed');
  });

  it('returns 409 when same onchainTaskId exists across chains without chainId', async () => {
    const worker = await loadWorker();
    const env = { DB: new FakeD1(), TASK_EXEC_QUEUE: { send: async () => {} } };
    await createErcTask(worker, env, '555', 9746);
    await createErcTask(worker, env, '555', 114);

    const res = await worker.fetch(
      req('POST', '/1/erc8001/payment-deposited', { onchainTaskId: '555' }),
      env,
      {}
    );

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'Ambiguous onchainTaskId across chains');
    assert.deepEqual(body.candidateChainIds.sort((a, b) => a - b), [114, 9746]);
  });

  it('routes to the correct task when chainId is provided', async () => {
    const worker = await loadWorker();
    const env = { DB: new FakeD1(), TASK_EXEC_QUEUE: { send: async () => {} } };
    const plasmaTask = await createErcTask(worker, env, '556', 9746);
    const flareTask = await createErcTask(worker, env, '556', 114);

    const flareRes = await worker.fetch(
      req('POST', '/1/erc8001/payment-deposited', { onchainTaskId: '556', chainId: 114 }),
      env,
      {}
    );
    assert.equal(flareRes.status, 200);
    const flareBody = await flareRes.json();
    assert.equal(flareBody.taskId, flareTask.id);
    assert.equal(flareBody.chainId, 114);

    const plasmaRes = await worker.fetch(
      req('POST', '/1/erc8001/payment-deposited', { onchainTaskId: '556', chainId: 9746 }),
      env,
      {}
    );
    assert.equal(plasmaRes.status, 200);
    const plasmaBody = await plasmaRes.json();
    assert.equal(plasmaBody.taskId, plasmaTask.id);
    assert.equal(plasmaBody.chainId, 9746);
  });
});
