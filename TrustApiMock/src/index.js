/**
 * Trust API Mock – Cloudflare Worker + D1
 * Returns trust scores for agents (e.g. example agents 1–10). Used by market maker for agent evaluation.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...CORS_HEADERS, ...headers, 'Content-Type': 'application/json' },
  });
}

function rowToAgent(row) {
  return {
    agentId: row.agent_id,
    score: row.score,
    signals: row.signals ? JSON.parse(row.signals) : null,
    updatedAt: row.updated_at,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
    const segments = pathname ? pathname.split('/') : [];

    if (segments[0] !== 'trust') {
      return jsonResponse(
        { message: 'Trust API Mock', endpoints: ['GET /trust', 'GET /trust/:agentId', 'PUT /trust/:agentId'] },
        200
      );
    }

    const agentId = segments[1];
    const db = env.DB;

    if (!db) {
      return jsonResponse({ error: 'D1 binding not configured' }, 500);
    }

    if (request.method === 'GET' && segments.length === 1) {
      return handleGetAll(db);
    }

    if (request.method === 'GET' && segments.length === 2 && agentId) {
      return handleGetOne(db, agentId);
    }

    if (request.method === 'PUT' && segments.length === 2 && agentId) {
      return handlePut(request, db, agentId);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

async function handleGetAll(db) {
  const { results } = await db.prepare('SELECT agent_id, score, signals, updated_at FROM agent_trust ORDER BY agent_id').all();
  const agents = (results || []).map(rowToAgent);
  return jsonResponse({ agents });
}

async function handleGetOne(db, agentId) {
  const row = await db.prepare('SELECT agent_id, score, signals, updated_at FROM agent_trust WHERE agent_id = ?')
    .bind(agentId)
    .first();
  if (!row) {
    return jsonResponse({ error: 'Agent not found', agentId }, 404);
  }
  return jsonResponse(rowToAgent(row));
}

async function handlePut(request, db, agentId) {
  let body;
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const score = body.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100) {
    return jsonResponse({ error: 'score must be an integer between 0 and 100' }, 400);
  }

  const signals = body.signals != null ? JSON.stringify(body.signals) : null;
  const updated_at = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO agent_trust (agent_id, score, signals, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET score = excluded.score, signals = excluded.signals, updated_at = excluded.updated_at`
    )
    .bind(agentId, score, signals, updated_at)
    .run();

  const row = await db.prepare('SELECT agent_id, score, signals, updated_at FROM agent_trust WHERE agent_id = ?')
    .bind(agentId)
    .first();

  return jsonResponse(rowToAgent(row));
}
