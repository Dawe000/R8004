const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');

const REMOTE = process.argv.includes('--remote');
const BASE_URL =
  process.env.AGENT_BASE_URL || (REMOTE ? '' : 'http://127.0.0.1:8787');
const EXAMPLEAGENTS_DIR = path.resolve(__dirname, '..');
const DEV_VARS_PATH = path.join(EXAMPLEAGENTS_DIR, '.dev.vars');
const SKIP_VENICE = process.argv.includes('--skip-venice');

function parseDevVars(content) {
  const vars = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      return;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    vars[key] = value;
  });
  return vars;
}

function resolveVeniceKey() {
  if (process.env.VENICE_API_KEY) {
    return process.env.VENICE_API_KEY;
  }
  if (fs.existsSync(DEV_VARS_PATH)) {
    const vars = parseDevVars(fs.readFileSync(DEV_VARS_PATH, 'utf8'));
    return vars.VENICE_API_KEY;
  }
  return '';
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForReady() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/1/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore and retry
    }
    await delay(1000);
  }
  throw new Error('Timed out waiting for wrangler dev to be ready.');
}

function runLocalMigrations() {
  const migration = spawnSync(
    'wrangler',
    ['d1', 'migrations', 'apply', 'example-agent-tasks', '--local'],
    {
      cwd: EXAMPLEAGENTS_DIR,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: 'false',
      },
      stdio: 'inherit',
    }
  );

  if (migration.status !== 0) {
    throw new Error('Failed to apply local D1 migrations.');
  }
}

async function fetchAgentIds() {
  const res = await fetch(`${BASE_URL}/`);
  assert(res.ok, `Root route discovery failed with ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.routes), 'Root response missing routes array');
  const ids = data.routes
    .map((route) => String(route).replace(/^\//, ''))
    .filter((id) => /^\d+$/.test(id));

  assert(ids.length >= 35, `Expected at least 35 agent routes, found ${ids.length}`);
  return ids;
}

async function testAgentCards(agentIds) {
  for (const id of agentIds) {
    const res = await fetch(`${BASE_URL}/${id}/card`);
    assert(res.ok, `Agent ${id} card request failed with ${res.status}`);
    const card = await res.json();
    assert(typeof card.name === 'string' && card.name.length > 0, `Agent ${id} card missing name`);
    assert(Array.isArray(card.skills) && card.skills.length > 0, `Agent ${id} card missing skills`);

    const hasPrivateFields = card.skills.some((skill) =>
      Object.prototype.hasOwnProperty.call(skill, 'systemPrompt') ||
      Object.prototype.hasOwnProperty.call(skill, 'userPrompt')
    );
    assert(!hasPrivateFields, `Agent ${id} card contains private prompt fields`);
  }
}

async function testHealth() {
  const res = await fetch(`${BASE_URL}/1/health`);
  assert(res.ok, `Health endpoint failed with ${res.status}`);
  const data = await res.json();
  assert(data.status === 'ok', 'Health endpoint did not return status ok');
}

async function testVeniceResponse({ requireLocalKey }) {
  if (requireLocalKey) {
    const veniceKey = resolveVeniceKey();
    assert(veniceKey && veniceKey !== 'your_venice_api_key_here',
      'VENICE_API_KEY is missing. Set it in exampleagents/.dev.vars or env to run Venice integration test.'
    );
  }

  const cardRes = await fetch(`${BASE_URL}/1/card`);
  assert(cardRes.ok, `Agent 1 card lookup failed with ${cardRes.status}`);
  const card = await cardRes.json();
  const firstSkillId = card?.skills?.[0]?.id;
  assert(firstSkillId, 'Agent 1 card missing first skill id for integration test');

  const payload = {
    task: {
      skill: firstSkillId,
      input: 'Return JSON where summary contains TEST_OK.',
    },
  };

  const res = await fetch(`${BASE_URL}/1/tasks?forceAsync=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Venice /tasks call failed with ${res.status}: ${errorText}`);
  }
  const accepted = await res.json();
  assert(accepted.id, 'Venice async response missing task id');
  assert(accepted.status === 'running', `Venice async expected running, got ${accepted.status}`);

  const polled = await pollTask('1', accepted.id, { channel: 'tasks', timeoutMs: 180000 });
  assert(polled.done, 'Venice async task did not finish in time');
  assert(polled.data.status === 'completed', `Venice async task ended with ${polled.data.status}`);
  const data = polled.data;

  const output = data?.result?.output;
  const raw = data?.result?.raw;
  const outputText = typeof output === 'string' ? output : JSON.stringify(output || {});
  const rawText = typeof raw === 'string' ? raw : '';

  assert(
    outputText.includes('TEST_OK') || rawText.includes('TEST_OK'),
    `Venice response did not include TEST_OK. Output: ${outputText || rawText}`
  );

  const statusRes = await fetch(`${BASE_URL}/1/tasks/${data.id}`);
  assert(statusRes.ok, `Persisted task fetch failed with ${statusRes.status}`);
  const statusData = await statusRes.json();
  assert(statusData.status === 'completed', 'Persisted task is not completed');
  assert(statusData.result, 'Persisted task result missing');
}

async function testPersistenceFastPath() {
  const payload = {
    task: {
      input: 'Return JSON with summary containing FAST_PATH_OK.',
    },
  };

  const res = await fetch(`${BASE_URL}/1/tasks?syncTimeoutMs=60000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert(res.status === 200, `Expected fast-path 200, received ${res.status}`);
  const task = await res.json();
  assert(task.id, 'Fast-path task missing id');
  assert(task.status === 'completed', 'Fast-path task was not completed');

  const getRes = await fetch(`${BASE_URL}/1/tasks/${task.id}`);
  assert(getRes.ok, `GET persisted fast-path task failed with ${getRes.status}`);
  const persisted = await getRes.json();
  assert(persisted.status === 'completed', 'Persisted fast-path task not completed');
  assert(
    persisted.result && (persisted.result.output || persisted.result.raw),
    'Persisted fast-path task missing Venice output content'
  );
}

async function pollTask(agentId, taskId, { channel = 'tasks', timeoutMs = 90000 } = {}) {
  const start = Date.now();
  const observedStatuses = [];

  while (Date.now() - start < timeoutMs) {
    const statusUrl =
      channel === 'a2a'
        ? `${BASE_URL}/${agentId}/a2a/tasks/${taskId}/status`
        : `${BASE_URL}/${agentId}/tasks/${taskId}`;
    const res = await fetch(statusUrl);

    if (res.status === 404) {
      return { done: true, deleted: true, observedStatuses };
    }

    assert(res.ok, `Polling failed with ${res.status}`);
    const data = await res.json();
    const status = channel === 'a2a' ? data.status : data.status;
    observedStatuses.push(status);

    if (status === 'completed' || status === 'failed') {
      return { done: true, data, observedStatuses };
    }

    await delay(1500);
  }

  return { done: false, observedStatuses };
}

async function testAsyncFallback() {
  const res = await fetch(`${BASE_URL}/1/tasks?forceAsync=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: { input: 'Return JSON with summary containing ASYNC_OK.' } }),
  });

  assert(res.status === 202, `Expected async fallback 202, received ${res.status}`);
  const data = await res.json();
  assert(data.id, 'Async response missing task id');
  assert(data.status === 'running', 'Async response status was not running');

  const result = await pollTask('1', data.id, { channel: 'tasks', timeoutMs: 120000 });
  assert(result.done, 'Async task did not finish within timeout');
  assert(result.data.status === 'completed', `Async task ended with ${result.data.status}`);
  assert(
    result.observedStatuses.includes('running') || result.observedStatuses.includes('submitted'),
    `Async task never observed running/submitted status: ${result.observedStatuses.join(',')}`
  );
}

async function testFailurePersistence() {
  const res = await fetch(`${BASE_URL}/1/tasks?forceFailure=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: { input: 'Force failure test payload.' } }),
  });

  assert(res.status === 500, `Expected forced failure 500, received ${res.status}`);
  const failed = await res.json();
  assert(failed.id, 'Forced failure response missing task id');
  assert(failed.status === 'failed', 'Forced failure response missing failed status');

  const getRes = await fetch(`${BASE_URL}/1/tasks/${failed.id}`);
  assert(getRes.ok, `GET failed task returned ${getRes.status}`);
  const persisted = await getRes.json();
  assert(persisted.status === 'failed', 'Persisted failed task status mismatch');
  assert(persisted.error, 'Persisted failed task missing error message');
}

async function testA2AParity() {
  const createRes = await fetch(`${BASE_URL}/1/a2a/tasks?forceAsync=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: { input: 'Return JSON with summary containing A2A_OK.' } }),
  });

  assert(createRes.status === 202, `Expected A2A async 202, received ${createRes.status}`);
  const created = await createRes.json();
  assert(created.id, 'A2A create response missing task id');

  const polled = await pollTask('1', created.id, { channel: 'a2a', timeoutMs: 120000 });
  assert(polled.done, 'A2A async task did not finish within timeout');
  assert(polled.data.status === 'completed', `A2A task ended with ${polled.data.status}`);

  const resultRes = await fetch(`${BASE_URL}/1/a2a/tasks/${created.id}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: 'Client result metadata update',
      marker: 'A2A_RESULT_OK',
    }),
  });
  assert(resultRes.ok, `A2A result update failed with ${resultRes.status}`);
}

async function testErc8001DispatchWithoutRawInput() {
  if (!process.env.AGENT_EVM_PRIVATE_KEY) {
    console.log('Skipping ERC8001 no-input dispatch test: AGENT_EVM_PRIVATE_KEY is not set in local env.');
    return;
  }

  const cardRes = await fetch(`${BASE_URL}/1/card`);
  assert(cardRes.ok, `Agent 1 card lookup failed with ${cardRes.status}`);
  const card = await cardRes.json();
  const firstSkillId = card?.skills?.[0]?.id;
  assert(firstSkillId, 'Agent 1 card missing first skill id for ERC8001 dispatch test');

  const createRes = await fetch(`${BASE_URL}/1/tasks?forceAsync=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: {
        skill: firstSkillId,
      },
      erc8001: {
        taskId: '999999999999',
        stakeAmountWei: '1',
        publicBaseUrl: BASE_URL,
      },
    }),
  });

  assert(createRes.status === 202, `Expected ERC8001 dispatch 202, received ${createRes.status}`);
  const created = await createRes.json();
  assert(created.id, 'ERC8001 dispatch response missing task id');
  assert(created.status === 'running', `ERC8001 dispatch status expected running, got ${created.status}`);

  const statusRes = await fetch(`${BASE_URL}/1/tasks/${created.id}`);
  assert(statusRes.ok, `ERC8001 persisted task fetch failed with ${statusRes.status}`);
  const status = await statusRes.json();
  assert(status.id === created.id, 'ERC8001 persisted task id mismatch');
}

async function triggerScheduledCleanup() {
  const candidates = [
    `${BASE_URL}/__scheduled`,
    `${BASE_URL}/cdn-cgi/handler/scheduled`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-cron': '0 */6 * * *' },
      });
      if (res.ok) {
        return;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error('Unable to trigger scheduled cleanup endpoint in local dev.');
}

async function testRetentionCleanup() {
  const res = await fetch(`${BASE_URL}/1/tasks?forceFailure=true&forceExpired=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: { input: 'Create immediately expired task row.' } }),
  });

  assert(res.status === 500, `Expected forced failure for expired-row setup, received ${res.status}`);
  const task = await res.json();
  assert(task.id, 'Expired-row setup response missing id');

  const before = await fetch(`${BASE_URL}/1/tasks/${task.id}`);
  assert(before.ok, 'Expired-row task should exist before cleanup');

  await triggerScheduledCleanup();
  await delay(1000);

  const after = await fetch(`${BASE_URL}/1/tasks/${task.id}`);
  assert(after.status === 404, `Expired-row task should be deleted after cleanup, got ${after.status}`);
}

async function run() {
  if (!BASE_URL) {
    throw new Error('AGENT_BASE_URL is required when running with --remote.');
  }

  if (!SKIP_VENICE && !REMOTE) {
    const veniceKey = resolveVeniceKey();
    if (!veniceKey || veniceKey === 'your_venice_api_key_here') {
      throw new Error(
        'VENICE_API_KEY is missing. Set it in exampleagents/.dev.vars or env, or run with --skip-venice.'
      );
    }
  }

  let wrangler;
  let shutdown = async () => {};

  if (!REMOTE) {
    runLocalMigrations();

    wrangler = spawn('wrangler', ['dev', '--local', '--test-scheduled', '--ip', '127.0.0.1', '--port', '8787'], {
      cwd: EXAMPLEAGENTS_DIR,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: 'false',
      },
      stdio: 'inherit',
    });

    shutdown = async () => {
      if (!wrangler.killed) {
        wrangler.kill();
        await delay(500);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  try {
    await waitForReady();
    const agentIds = await fetchAgentIds();
    await testHealth();
    await testAgentCards(agentIds);
    await testFailurePersistence();
    await testErc8001DispatchWithoutRawInput();
    if (!REMOTE) {
      await testRetentionCleanup();
    }
    if (!SKIP_VENICE) {
      await testPersistenceFastPath();
      await testAsyncFallback();
      await testA2AParity();
      await testVeniceResponse({ requireLocalKey: !REMOTE });
    }
    console.log('All tests passed.');
  } finally {
    await shutdown();
  }
}

run().catch((error) => {
  console.error(`Tests failed: ${error.message}`);
  process.exitCode = 1;
});
