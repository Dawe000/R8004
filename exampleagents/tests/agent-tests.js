const { spawn } = require('child_process');
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

async function testAgentCards() {
  for (let id = 1; id <= 10; id += 1) {
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

  const payload = {
    task: {
      skill: 'security_analysis',
      input: 'Return JSON with summary containing TEST_OK. Code: function add(a,b){return a+b;}',
    },
  };

  const res = await fetch(`${BASE_URL}/1/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Venice /tasks call failed with ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  assert(data.status === 'completed', 'Venice /tasks did not complete');

  const output = data?.result?.output;
  const raw = data?.result?.raw;
  const outputText = typeof output === 'string' ? output : JSON.stringify(output || {});
  const rawText = typeof raw === 'string' ? raw : '';

  assert(
    outputText.includes('TEST_OK') || rawText.includes('TEST_OK'),
    `Venice response did not include TEST_OK. Output: ${outputText || rawText}`
  );
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
    wrangler = spawn('wrangler', ['dev', '--local', '--ip', '127.0.0.1', '--port', '8787'], {
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
    await testHealth();
    await testAgentCards();
    if (!SKIP_VENICE) {
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
