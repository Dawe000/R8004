// Multi-agent Cloudflare Worker for ERC8001 example agents (routes /1 through /35)
import agentCard1 from './agent-cards/agent-1.json' assert { type: 'json' };
import agentCard2 from './agent-cards/agent-2.json' assert { type: 'json' };
import agentCard3 from './agent-cards/agent-3.json' assert { type: 'json' };
import agentCard4 from './agent-cards/agent-4.json' assert { type: 'json' };
import agentCard5 from './agent-cards/agent-5.json' assert { type: 'json' };
import agentCard6 from './agent-cards/agent-6.json' assert { type: 'json' };
import agentCard7 from './agent-cards/agent-7.json' assert { type: 'json' };
import agentCard8 from './agent-cards/agent-8.json' assert { type: 'json' };
import agentCard9 from './agent-cards/agent-9.json' assert { type: 'json' };
import agentCard10 from './agent-cards/agent-10.json' assert { type: 'json' };
import agentCard11 from './agent-cards/agent-11.json' assert { type: 'json' };
import agentCard12 from './agent-cards/agent-12.json' assert { type: 'json' };
import agentCard13 from './agent-cards/agent-13.json' assert { type: 'json' };
import agentCard14 from './agent-cards/agent-14.json' assert { type: 'json' };
import agentCard15 from './agent-cards/agent-15.json' assert { type: 'json' };
import agentCard16 from './agent-cards/agent-16.json' assert { type: 'json' };
import agentCard17 from './agent-cards/agent-17.json' assert { type: 'json' };
import agentCard18 from './agent-cards/agent-18.json' assert { type: 'json' };
import agentCard19 from './agent-cards/agent-19.json' assert { type: 'json' };
import agentCard20 from './agent-cards/agent-20.json' assert { type: 'json' };
import agentCard21 from './agent-cards/agent-21.json' assert { type: 'json' };
import agentCard22 from './agent-cards/agent-22.json' assert { type: 'json' };
import agentCard23 from './agent-cards/agent-23.json' assert { type: 'json' };
import agentCard24 from './agent-cards/agent-24.json' assert { type: 'json' };
import agentCard25 from './agent-cards/agent-25.json' assert { type: 'json' };
import agentCard26 from './agent-cards/agent-26.json' assert { type: 'json' };
import agentCard27 from './agent-cards/agent-27.json' assert { type: 'json' };
import agentCard28 from './agent-cards/agent-28.json' assert { type: 'json' };
import agentCard29 from './agent-cards/agent-29.json' assert { type: 'json' };
import agentCard30 from './agent-cards/agent-30.json' assert { type: 'json' };
import agentCard31 from './agent-cards/agent-31.json' assert { type: 'json' };
import agentCard32 from './agent-cards/agent-32.json' assert { type: 'json' };
import agentCard33 from './agent-cards/agent-33.json' assert { type: 'json' };
import agentCard34 from './agent-cards/agent-34.json' assert { type: 'json' };
import agentCard35 from './agent-cards/agent-35.json' assert { type: 'json' };
const TASK_STATUS = {
  SUBMITTED: 'submitted',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const TASK_CHANNEL = {
  TASKS: 'tasks',
  A2A: 'a2a',
};

const DEFAULT_SYNC_TIMEOUT_MS = 20000;
const MAX_SYNC_TIMEOUT_MS = 60000;
const MIN_SYNC_TIMEOUT_MS = 1000;
const TASK_RETENTION_DAYS = 7;
const CLEANUP_BATCH_SIZE = 200;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
    const segments = pathname ? pathname.split('/') : [];

    if (segments.length === 0) {
      return jsonResponse(
        {
          message: 'ERC8001 Example Agents Worker',
          routes: Object.keys(AGENTS).map((id) => `/${id}`),
        },
        200,
        corsHeaders
      );
    }

    const agentId = segments[0];
    const agent = AGENTS[agentId];
    const agentCard = AGENT_CARDS[agentId];

    if (!agent || !agentCard) {
      return jsonResponse(
        { error: 'Unknown agent route. Use one of the configured agent IDs.' },
        404,
        corsHeaders
      );
    }

    if (segments.length === 1) {
      return jsonResponse(
        {
          agentId: agentId,
          name: agentCard.name,
          endpoints: [
            `/${agentId}/health`,
            `/${agentId}/card`,
            `/${agentId}/tasks`,
            `/${agentId}/tasks/{taskId}`,
            `/${agentId}/telemetry`,
            `/${agentId}/a2a/tasks`,
            `/${agentId}/a2a/tasks/{taskId}/status`,
            `/${agentId}/a2a/tasks/{taskId}/result`,
          ],
        },
        200,
        corsHeaders
      );
    }

    if (segments[1] === 'health') {
      return jsonResponse(
        { status: 'ok', service: agentCard.name },
        200,
        corsHeaders
      );
    }

    if (segments[1] === 'card') {
      return jsonResponse(agentCard, 200, corsHeaders);
    }

    if (segments[1] === '.well-known' && segments[2] === 'agent-card.json') {
      return jsonResponse(agentCard, 200, corsHeaders);
    }

    if (segments[1] === 'telemetry') {
      return jsonResponse(
        { status: 'ok', agentId: agent.id, receivedAt: new Date().toISOString() },
        200,
        corsHeaders
      );
    }

    if (segments[1] === 'tasks') {
      return handleTasks(request, env, ctx, corsHeaders, agent, segments, url);
    }

    if (segments[1] === 'a2a' && segments[2] === 'tasks') {
      return handleA2ATasks(request, env, ctx, corsHeaders, agent, segments, url);
    }

    return jsonResponse(
      { error: 'Unknown endpoint for agent.', hint: 'Try /card or /tasks.' },
      404,
      corsHeaders
    );
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        await processQueuedTaskMessage(message.body, env);
        if (typeof message.ack === 'function') {
          message.ack();
        }
      } catch (error) {
        console.error('Queue task processing failed', error);
        if (typeof message.retry === 'function') {
          message.retry();
        } else {
          throw error;
        }
      }
    }
  },

  async scheduled(event, env, ctx) {
    try {
      const deleted = await cleanupExpiredTasks(env);
      console.log(`Scheduled cleanup removed ${deleted} expired tasks`);
    } catch (error) {
      console.error('Scheduled cleanup failed', error);
      throw error;
    }
  },
};

async function handleTasks(request, env, ctx, corsHeaders, agent, segments, url) {
  if (request.method === 'POST' && segments.length === 2) {
    return createTask(request, env, ctx, corsHeaders, agent, TASK_CHANNEL.TASKS, url);
  }

  if (request.method === 'GET' && segments.length === 3) {
    try {
      const task = await getTaskById(env, segments[2]);
      if (!task || task.agent_id !== agent.id || task.channel !== TASK_CHANNEL.TASKS) {
        return jsonResponse({ error: 'Task not found.' }, 404, corsHeaders);
      }
      return jsonResponse(formatTaskForClient(task), 200, corsHeaders);
    } catch (error) {
      return jsonResponse(
        { error: error.message || 'Failed to load task status.' },
        500,
        corsHeaders
      );
    }
  }

  return jsonResponse(
    { error: 'Unsupported /tasks route.' },
    404,
    corsHeaders
  );
}

async function handleA2ATasks(request, env, ctx, corsHeaders, agent, segments, url) {
  if (request.method === 'POST' && segments.length === 3) {
    return createTask(request, env, ctx, corsHeaders, agent, TASK_CHANNEL.A2A, url);
  }

  if (segments.length === 5 && segments[4] === 'status' && request.method === 'GET') {
    try {
      const task = await getTaskById(env, segments[3]);
      if (!task || task.agent_id !== agent.id || task.channel !== TASK_CHANNEL.A2A) {
        return jsonResponse({ error: 'Task not found.' }, 404, corsHeaders);
      }
      return jsonResponse(
        {
          taskId: task.id,
          status: task.status,
          agentId: task.agent_id,
          createdAt: task.created_at,
          startedAt: task.started_at,
          completedAt: task.completed_at,
          updatedAt: task.updated_at,
          error: task.error_message || undefined,
        },
        200,
        corsHeaders
      );
    } catch (error) {
      return jsonResponse(
        { error: error.message || 'Failed to load A2A task status.' },
        500,
        corsHeaders
      );
    }
  }

  if (segments.length === 5 && segments[4] === 'result' && request.method === 'POST') {
    try {
      const taskId = segments[3];
      const task = await getTaskById(env, taskId);
      if (!task || task.agent_id !== agent.id || task.channel !== TASK_CHANNEL.A2A) {
        return jsonResponse({ error: 'Task not found.' }, 404, corsHeaders);
      }

      const body = await parseRequestBody(request);
      const now = nowIso();
      const responseMeta = safeJsonParse(task.response_meta_json) || {};
      responseMeta.a2aResultSubmittedAt = now;
      responseMeta.a2aResultSource = 'client';

      await markTaskCompleted(env, {
        taskId: task.id,
        result: body,
        modelUsed: task.model_used || task.model_requested,
        responseMeta: responseMeta,
      });

      return jsonResponse(
        {
          taskId: task.id,
          status: TASK_STATUS.COMPLETED,
          message: 'Result persisted for A2A task.',
          updatedAt: now,
        },
        200,
        corsHeaders
      );
    } catch (error) {
      return jsonResponse(
        { error: error.message || 'Failed to persist A2A task result.' },
        500,
        corsHeaders
      );
    }
  }

  return jsonResponse(
    { error: 'Unsupported /a2a/tasks route.' },
    404,
    corsHeaders
  );
}

async function createTask(request, env, ctx, corsHeaders, agent, channel, url) {
  let taskId = null;

  try {
    const body = await parseRequestBody(request);
    const input = extractInput(body);

    if (!input) {
      return jsonResponse({ error: 'No input provided for task.' }, 400, corsHeaders);
    }

    const skillId = resolveSkillId(agent, body);
    const modelRequested = resolveRequestedModel(agent, body, env);
    const now = nowIso();
    const forceExpired = isTruthy(url.searchParams.get('forceExpired')) || isTruthy(request.headers.get('x-force-expired'));
    const expiresAt = forceExpired ? addDaysIso(-1) : addDaysIso(TASK_RETENTION_DAYS);
    const forceAsync = isTruthy(url.searchParams.get('forceAsync')) || isTruthy(request.headers.get('x-force-async'));
    const forceFailure = isTruthy(url.searchParams.get('forceFailure')) || isTruthy(request.headers.get('x-force-failure'));
    const syncTimeoutMs = resolveSyncTimeoutMs(url.searchParams.get('syncTimeoutMs'), env.SYNC_TASK_TIMEOUT_MS);

    taskId = crypto.randomUUID();

    await insertTask(env, {
      id: taskId,
      agentId: agent.id,
      channel: channel,
      status: TASK_STATUS.SUBMITTED,
      requestPayloadJson: JSON.stringify(body ?? {}),
      inputText: input,
      skillId: skillId,
      modelRequested: modelRequested,
      modelUsed: null,
      resultJson: null,
      errorMessage: null,
      responseMetaJson: JSON.stringify({
        syncTimeoutMs: syncTimeoutMs,
        forceAsync: forceAsync,
        forceFailure: forceFailure,
        forceExpired: forceExpired,
      }),
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
      expiresAt: expiresAt,
    });

    if (forceAsync) {
      await markTaskRunning(env, taskId);
      await enqueueTaskExecution(env, { taskId: taskId, agentId: agent.id, channel: channel, forceFailure: forceFailure });
      return jsonResponse(
        formatAsyncAcceptedResponse(taskId, channel, agent.id, now),
        202,
        corsHeaders
      );
    }

    await markTaskRunning(env, taskId);

    const execution = await runWithTimeout(
      (signal) =>
        processAgentTask(agent, body, input, env, {
          skillId: skillId,
          modelRequested: modelRequested,
          signal: signal,
          forceFailure: forceFailure,
        }),
      syncTimeoutMs
    );

    await markTaskCompleted(env, {
      taskId: taskId,
      result: execution,
      modelUsed: execution?.model || modelRequested,
      responseMeta: execution?.responseMeta || null,
    });

    const completedTask = await getTaskById(env, taskId);
    return jsonResponse(formatTaskForClient(completedTask), 200, corsHeaders);
  } catch (error) {
    if (error instanceof SyncTimeoutError && taskId) {
      try {
        await enqueueTaskExecution(env, {
          taskId: taskId,
          agentId: agent.id,
          channel: channel,
          forceFailure: false,
        });
        const submittedTask = await getTaskById(env, taskId);
        return jsonResponse(
          formatAsyncAcceptedResponse(
            taskId,
            channel,
            agent.id,
            submittedTask?.created_at || nowIso()
          ),
          202,
          corsHeaders
        );
      } catch (enqueueError) {
        await safeMarkTaskFailed(env, taskId, enqueueError.message || 'Failed to enqueue task execution.');
        return jsonResponse(
          { id: taskId, status: TASK_STATUS.FAILED, error: enqueueError.message || 'Task queue enqueue failed.' },
          500,
          corsHeaders
        );
      }
    }

    if (taskId) {
      await safeMarkTaskFailed(env, taskId, error.message || 'Task creation failed.');
      return jsonResponse(
        { id: taskId, status: TASK_STATUS.FAILED, error: error.message || 'Task creation failed.' },
        500,
        corsHeaders
      );
    }

    return jsonResponse(
      { error: error.message || 'Task creation failed.' },
      500,
      corsHeaders
    );
  }
}

function extractInput(body) {
  if (!body) {
    return '';
  }

  const input =
    body?.task?.input ??
    body?.input ??
    body?.prompt ??
    body?.text ??
    body;

  if (typeof input === 'string') {
    return input.trim();
  }

  if (typeof input === 'object' && input !== null) {
    if (typeof input.text === 'string') {
      return input.text.trim();
    }
    return JSON.stringify(input, null, 2);
  }

  return String(input || '').trim();
}

async function processAgentTask(agent, body, inputText, env, options = {}) {
  if (options.forceFailure) {
    throw new Error('Forced Venice failure for testing.');
  }

  const skillId =
    options.skillId ??
    body?.task?.skill ??
    body?.skill ??
    body?.task?.capabilityId ??
    body?.capabilityId ??
    agent.skills[0].id;

  const skill = agent.skills.find((entry) => entry.id === skillId) || agent.skills[0];
  const systemPrompt = skill.systemPrompt;
  const userPrompt = `${skill.userPrompt}\n\n${inputText}`;

  const model = options.modelRequested || resolveRequestedModel(agent, body, env);
  const apiKey = env.VENICE_API_KEY;

  if (!apiKey) {
    throw new Error('Missing VENICE_API_KEY in environment');
  }

  const attempts = [
    {
      id: 'base',
      maxTokens: 1600,
      temperature: 0.2,
      promptSuffix: '',
      veniceParametersOverride: {},
    },
    {
      id: 'disable_thinking',
      maxTokens: 2200,
      temperature: 0.2,
      promptSuffix: '',
      veniceParametersOverride: { disable_thinking: true },
    },
    {
      id: 'fallback_best_effort',
      maxTokens: 3200,
      temperature: 0.1,
      promptSuffix:
        '\n\nIf sources are limited, return best-effort JSON and include uncertainty in the summary.',
      veniceParametersOverride: { disable_thinking: true },
    },
  ];

  let lastMeta = null;

  for (const attempt of attempts) {
    const requestBody = buildVeniceRequestBody({
      model,
      systemPrompt,
      userPrompt: `${userPrompt}${attempt.promptSuffix}`,
      baseVeniceParameters: agent.veniceParameters,
      veniceParametersOverride: attempt.veniceParametersOverride,
      maxTokens: attempt.maxTokens,
      temperature: attempt.temperature,
    });

    const data = await callVenice(requestBody, apiKey, options.signal);
    const message = data?.choices?.[0]?.message || {};
    const content = extractVeniceContent(message);
    const cleaned = stripCodeFences(content);

    lastMeta = {
      attempt: attempt.id,
      finishReason: data?.choices?.[0]?.finish_reason || null,
      hasReasoningContent: Boolean(message?.reasoning_content),
      usage: data?.usage || null,
    };

    if (!cleaned) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }

    return {
      agentId: agent.id,
      skill: skill.id,
      model: data?.model || model,
      output: parsed || cleaned,
      raw: parsed ? undefined : cleaned,
      responseMeta: {
        attempt: attempt.id,
        finishReason: data?.choices?.[0]?.finish_reason || null,
      },
    };
  }

  throw new Error(`Venice AI returned empty content after retries: ${JSON.stringify(lastMeta)}`);
}

function buildVeniceRequestBody({
  model,
  systemPrompt,
  userPrompt,
  baseVeniceParameters,
  veniceParametersOverride,
  maxTokens,
  temperature,
}) {
  const veniceParameters = {
    disable_thinking: true,
    include_venice_system_prompt: false,
    ...(baseVeniceParameters || {}),
    ...(veniceParametersOverride || {}),
  };

  return {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature: temperature,
    venice_parameters: veniceParameters,
  };
}

async function callVenice(requestBody, apiKey, signal) {
  const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Venice AI error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function extractVeniceContent(message) {
  const content = message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (typeof part?.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('\n');
  }

  if (typeof content?.text === 'string') {
    return content.text;
  }

  return '';
}

function stripCodeFences(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return '';
  }

  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : trimmed;
}

function jsonResponse(payload, status, corsHeaders) {
  return new Response(JSON.stringify(payload, null, 2), {
    status: status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function formatAsyncAcceptedResponse(taskId, channel, agentId, createdAt) {
  return {
    id: taskId,
    status: TASK_STATUS.RUNNING,
    createdAt: createdAt,
    statusUrl:
      channel === TASK_CHANNEL.A2A
        ? `/${agentId}/a2a/tasks/${taskId}/status`
        : `/${agentId}/tasks/${taskId}`,
    pollAfterMs: 2000,
  };
}

function formatTaskForClient(task) {
  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status,
    agentId: task.agent_id,
    channel: task.channel,
    input: task.input_text,
    result: safeJsonParse(task.result_json),
    error: task.error_message || undefined,
    skillId: task.skill_id || undefined,
    modelRequested: task.model_requested || undefined,
    modelUsed: task.model_used || undefined,
    createdAt: task.created_at,
    startedAt: task.started_at || undefined,
    completedAt: task.completed_at || undefined,
    updatedAt: task.updated_at,
    expiresAt: task.expires_at,
    responseMeta: safeJsonParse(task.response_meta_json),
  };
}

async function processQueuedTaskMessage(rawMessageBody, env) {
  const payload =
    typeof rawMessageBody === 'string'
      ? safeJsonParse(rawMessageBody) || {}
      : rawMessageBody || {};

  const taskId = payload.taskId;
  if (!taskId) {
    throw new Error('Queue message missing taskId');
  }

  const task = await getTaskById(env, taskId);
  if (!task) {
    return;
  }

  if (task.status === TASK_STATUS.COMPLETED || task.status === TASK_STATUS.FAILED) {
    return;
  }

  await markTaskRunning(env, task.id);

  const agent = AGENTS[task.agent_id];
  if (!agent) {
    await markTaskFailed(env, task.id, `Unknown agent id: ${task.agent_id}`);
    return;
  }

  const body = safeJsonParse(task.request_payload_json) || {};

  try {
    const result = await processAgentTask(agent, body, task.input_text, env, {
      skillId: task.skill_id || undefined,
      modelRequested: task.model_requested || undefined,
      forceFailure: Boolean(payload.forceFailure),
    });

    await markTaskCompleted(env, {
      taskId: task.id,
      result: result,
      modelUsed: result?.model || task.model_requested,
      responseMeta: result?.responseMeta || null,
    });
  } catch (error) {
    await markTaskFailed(env, task.id, error.message || 'Queued task execution failed.');
    throw error;
  }
}

async function enqueueTaskExecution(env, payload) {
  if (!env.TASK_EXEC_QUEUE || typeof env.TASK_EXEC_QUEUE.send !== 'function') {
    throw new Error('Missing TASK_EXEC_QUEUE binding in environment.');
  }
  await env.TASK_EXEC_QUEUE.send(payload);
}

function resolveSkillId(agent, body) {
  const requestedSkill =
    body?.task?.skill ??
    body?.skill ??
    body?.task?.capabilityId ??
    body?.capabilityId;
  const found = agent.skills.find((entry) => entry.id === requestedSkill);
  return (found || agent.skills[0]).id;
}

function resolveRequestedModel(agent, body, env) {
  return (
    body?.task?.model ||
    body?.model ||
    agent.model ||
    (agent.modelEnv ? env[agent.modelEnv] : undefined) ||
    env.VENICE_MODEL ||
    'zai-org-glm-4.7'
  );
}

function resolveSyncTimeoutMs(queryValue, envValue) {
  const candidate = Number(queryValue || envValue || DEFAULT_SYNC_TIMEOUT_MS);
  if (!Number.isFinite(candidate)) {
    return DEFAULT_SYNC_TIMEOUT_MS;
  }
  return Math.max(MIN_SYNC_TIMEOUT_MS, Math.min(MAX_SYNC_TIMEOUT_MS, Math.floor(candidate)));
}

function isTruthy(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

async function parseRequestBody(request) {
  const rawBody = await request.text();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return { input: rawBody };
  }
}

async function runWithTimeout(taskFn, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort('sync-timeout');
  }, timeoutMs);

  try {
    return await taskFn(controller.signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw new SyncTimeoutError(`Synchronous timeout exceeded ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAbortError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.message === 'The operation was aborted.' ||
    String(error?.message || '').toLowerCase().includes('aborted')
  );
}

class SyncTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SyncTimeoutError';
  }
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  const now = Date.now();
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function requireDb(env) {
  if (!env.DB) {
    throw new Error('Missing DB binding in environment.');
  }
  return env.DB;
}

async function insertTask(env, task) {
  const db = requireDb(env);
  await db
    .prepare(
      `
        INSERT INTO tasks (
          id, agent_id, channel, status, request_payload_json, input_text, skill_id,
          model_requested, model_used, result_json, error_message, response_meta_json,
          created_at, started_at, completed_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      task.id,
      task.agentId,
      task.channel,
      task.status,
      task.requestPayloadJson,
      task.inputText,
      task.skillId,
      task.modelRequested,
      task.modelUsed,
      task.resultJson,
      task.errorMessage,
      task.responseMetaJson,
      task.createdAt,
      task.startedAt,
      task.completedAt,
      task.updatedAt,
      task.expiresAt
    )
    .run();
}

async function markTaskRunning(env, taskId) {
  const db = requireDb(env);
  const now = nowIso();
  await db
    .prepare(
      `
        UPDATE tasks
        SET status = ?, started_at = COALESCE(started_at, ?), updated_at = ?, error_message = NULL
        WHERE id = ?
      `
    )
    .bind(TASK_STATUS.RUNNING, now, now, taskId)
    .run();
}

async function markTaskCompleted(env, { taskId, result, modelUsed, responseMeta }) {
  const db = requireDb(env);
  const now = nowIso();
  await db
    .prepare(
      `
        UPDATE tasks
        SET status = ?, result_json = ?, error_message = NULL, model_used = ?, response_meta_json = ?,
            completed_at = ?, updated_at = ?
        WHERE id = ?
      `
    )
    .bind(
      TASK_STATUS.COMPLETED,
      JSON.stringify(result ?? null),
      modelUsed || null,
      JSON.stringify(responseMeta ?? null),
      now,
      now,
      taskId
    )
    .run();
}

async function markTaskFailed(env, taskId, errorMessage) {
  const db = requireDb(env);
  const now = nowIso();
  await db
    .prepare(
      `
        UPDATE tasks
        SET status = ?, error_message = ?, updated_at = ?, completed_at = COALESCE(completed_at, ?)
        WHERE id = ?
      `
    )
    .bind(TASK_STATUS.FAILED, String(errorMessage || 'Unknown task failure'), now, now, taskId)
    .run();
}

async function safeMarkTaskFailed(env, taskId, errorMessage) {
  try {
    await markTaskFailed(env, taskId, errorMessage);
  } catch (persistError) {
    console.error('Failed to persist task failure state', persistError);
  }
}

async function getTaskById(env, taskId) {
  const db = requireDb(env);
  return db
    .prepare('SELECT * FROM tasks WHERE id = ? LIMIT 1')
    .bind(taskId)
    .first();
}

async function cleanupExpiredTasks(env) {
  const db = requireDb(env);
  const now = nowIso();
  let deletedTotal = 0;

  while (true) {
    const result = await db
      .prepare(
        `
          DELETE FROM tasks
          WHERE id IN (
            SELECT id FROM tasks
            WHERE expires_at < ?
            ORDER BY expires_at ASC
            LIMIT ?
          )
        `
      )
      .bind(now, CLEANUP_BATCH_SIZE)
      .run();

    const deleted = Number(result?.meta?.changes || 0);
    deletedTotal += deleted;
    if (deleted < CLEANUP_BATCH_SIZE) {
      break;
    }
  }

  return deletedTotal;
}

const AGENT_CARDS = {
  '1': agentCard1,
  '2': agentCard2,
  '3': agentCard3,
  '4': agentCard4,
  '5': agentCard5,
  '6': agentCard6,
  '7': agentCard7,
  '8': agentCard8,
  '9': agentCard9,
  '10': agentCard10,
  '11': agentCard11,
  '12': agentCard12,
  '13': agentCard13,
  '14': agentCard14,
  '15': agentCard15,
  '16': agentCard16,
  '17': agentCard17,
  '18': agentCard18,
  '19': agentCard19,
  '20': agentCard20,
  '21': agentCard21,
  '22': agentCard22,
  '23': agentCard23,
  '24': agentCard24,
  '25': agentCard25,
  '26': agentCard26,
  '27': agentCard27,
  '28': agentCard28,
  '29': agentCard29,
  '30': agentCard30,
  '31': agentCard31,
  '32': agentCard32,
  '33': agentCard33,
  '34': agentCard34,
  '35': agentCard35,
};

const AGENTS = {
  '1': {
    id: '1',
    modelEnv: 'VENICE_MODEL_TWITTER',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'twitter_sentiment_snapshot',
        systemPrompt:
          'You are a Twitter/X sentiment analyst. Use web search and scraping to find the most recent public sentiment signals for the given topic, keyword, or ticker. Return JSON with keys: topic, sentiment {label, score}, highlights (array of strings), notablePosts (array of {summary, author, time}), asOf (ISO timestamp), sources (array of {title, url}).',
        userPrompt: 'Analyze current Twitter/X sentiment for:',
      },
      {
        id: 'twitter_trend_summary',
        systemPrompt:
          'You summarize Twitter/X trends. Use web search and scraping to identify top themes, rising narratives, and sentiment drivers. Return JSON with keys: topic, themes (array of {theme, sentiment, evidence}), asOf (ISO timestamp), sources (array of {title, url}).',
        userPrompt: 'Summarize Twitter/X trends for:',
      },
    ],
  },
  '2': {
    id: '2',
    modelEnv: 'VENICE_MODEL_POLYMARKET',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'polymarket_price_lookup',
        systemPrompt:
          'You are a Polymarket price finder. Use web search and scraping to locate the current market odds/prices for the requested market. Return JSON with keys: market, outcomes (array of {name, price, impliedProbability}), volume, liquidity, asOf (ISO timestamp), sources (array of {title, url}).',
        userPrompt: 'Find the current Polymarket prices for:',
      },
      {
        id: 'polymarket_market_summary',
        systemPrompt:
          'You summarize Polymarket markets. Use web search and scraping to summarize market description, recent price movement, and key drivers. Return JSON with keys: market, summary, recentMoves (array), asOf (ISO timestamp), sources (array of {title, url}).',
        userPrompt: 'Summarize this Polymarket market:',
      },
    ],
  },
  '3': {
    id: '3',
    modelEnv: 'VENICE_MODEL_STOCKS',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'stock_price_lookup',
        systemPrompt:
          'You are a stock price finder. Use web search and scraping to return the latest price and percent change for the requested ticker. Return JSON with keys: ticker, price, changePercent, currency, exchange, asOf (ISO timestamp), sources (array of {title, url}).',
        userPrompt: 'Find the latest stock price for:',
      },
      {
        id: 'company_snapshot',
        systemPrompt:
          'You provide a brief company snapshot using web search and scraping. Return JSON with keys: ticker, companyName, sector, marketCap, dayRange, week52Range, asOf (ISO timestamp), sources (array of {title, url}).',
        userPrompt: 'Provide a company snapshot for:',
      },
    ],
  },
  '4': {
    id: '4',
    skills: [
      {
        id: 'literature_summary',
        systemPrompt:
          'You summarize research. Return JSON with keys: summary, keyFindings (array), openQuestions (array).',
        userPrompt: 'Summarize the following research content:',
      },
      {
        id: 'evidence_map',
        systemPrompt:
          'You map evidence. Return JSON with keys: claims (array of {claim,evidence,confidence}), summary.',
        userPrompt: 'Create an evidence map from the following materials:',
      },
    ],
  },
  '5': {
    id: '5',
    skills: [
      {
        id: 'prd_draft',
        systemPrompt:
          'You write PRDs. Return JSON with keys: overview, goals (array), requirements (array), metrics (array), risks (array).',
        userPrompt: 'Create a PRD draft for the following product idea:',
      },
      {
        id: 'user_story_generation',
        systemPrompt:
          'You write user stories. Return JSON with keys: stories (array of {asA, iWant, soThat, acceptanceCriteria}).',
        userPrompt: 'Generate user stories based on this product idea:',
      },
    ],
  },
  '6': {
    id: '6',
    skills: [
      {
        id: 'landing_page_copy',
        systemPrompt:
          'You are a marketing copywriter. Return JSON with keys: headline, subheadline, bullets (array), cta, tone.',
        userPrompt: 'Write landing page copy for the following product:',
      },
      {
        id: 'ad_variations',
        systemPrompt:
          'You generate ad copy. Return JSON with keys: variants (array of {headline,body,cta}), summary.',
        userPrompt: 'Create ad copy variants for this campaign:',
      },
    ],
  },
  '7': {
    id: '7',
    skills: [
      {
        id: 'support_reply',
        systemPrompt:
          'You write support replies. Return JSON with keys: reply, tone, followUps (array).',
        userPrompt: 'Draft a support reply to the following message:',
      },
      {
        id: 'triage_classification',
        systemPrompt:
          'You triage support requests. Return JSON with keys: category, urgency, nextStep.',
        userPrompt: 'Classify this support request:',
      },
    ],
  },
  '8': {
    id: '8',
    skills: [
      {
        id: 'heuristic_review',
        systemPrompt:
          'You are a UX evaluator. Return JSON with keys: issues (array of {heuristic,issue,impact,fix}), summary.',
        userPrompt: 'Review this UI description for usability heuristics:',
      },
      {
        id: 'usability_risks',
        systemPrompt:
          'You identify usability risks. Return JSON with keys: risks (array of {risk,impact,mitigation}), summary.',
        userPrompt: 'Identify usability risks in this flow:',
      },
    ],
  },
  '9': {
    id: '9',
    skills: [
      {
        id: 'minutes_summary',
        systemPrompt:
          'You summarize meetings. Return JSON with keys: summary, decisions (array), blockers (array).',
        userPrompt: 'Summarize these meeting notes:',
      },
      {
        id: 'action_items',
        systemPrompt:
          'You extract action items. Return JSON with keys: actions (array of {item,owner,dueDate}).',
        userPrompt: 'Extract action items from these notes:',
      },
    ],
  },
  '10': {
    id: '10',
    skills: [
      {
        id: 'privacy_review',
        systemPrompt:
          'You review privacy policies. Return JSON with keys: gaps (array), recommendations (array), summary.',
        userPrompt: 'Review this policy or flow for privacy gaps:',
      },
      {
        id: 'policy_gap_analysis',
        systemPrompt:
          'You analyze policy gaps. Return JSON with keys: gaps (array of {gap,risk,mitigation}), summary.',
        userPrompt: 'Analyze this policy or procedure for gaps:',
      },
    ],
  },
  '31': {
    id: '31',
    modelEnv: 'VENICE_MODEL_SENTIMENT_31',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'cross_platform_sentiment_snapshot',
        systemPrompt:
          'You are a cross-platform sentiment analyst. Use web search and scraping to combine social posts, blogs, and financial media sentiment. Return strict JSON with keys: topic, sentiment {label, score}, platformBreakdown (array of {platform, sentiment, confidence}), summary, asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Create a cross-platform sentiment snapshot for:',
      },
      {
        id: 'momentum_shift_detector',
        systemPrompt:
          'You detect short-term sentiment momentum shifts. Use web search and scraping to compare fresh sentiment against prior baseline. Return strict JSON with keys: topic, momentum {direction, strength}, leadingSignals (array), summary, asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Detect sentiment momentum shifts for:',
      },
    ],
  },
  '32': {
    id: '32',
    modelEnv: 'VENICE_MODEL_SENTIMENT_32',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'influencer_weighted_score',
        systemPrompt:
          'You are an influencer-weighted sentiment analyst. Use web search and scraping to identify influential voices and weight sentiment by reach and credibility. Return strict JSON with keys: topic, weightedSentiment {label, score}, keyVoices (array of {name, stance, influenceEstimate}), summary, asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Analyze influencer-weighted sentiment for:',
      },
      {
        id: 'narrative_driver_extraction',
        systemPrompt:
          'You extract dominant narratives driving sentiment. Use web search and scraping and return strict JSON with keys: topic, narratives (array of {narrative, sentimentImpact, evidence}), summary, asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Extract sentiment narrative drivers for:',
      },
    ],
  },
  '33': {
    id: '33',
    modelEnv: 'VENICE_MODEL_SENTIMENT_33',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'news_social_divergence_score',
        systemPrompt:
          'You compare media sentiment and social sentiment. Use web search and scraping to compute divergence and likely implications. Return strict JSON with keys: topic, divergenceScore, mediaSentiment, socialSentiment, interpretation, asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Compare media vs social sentiment for:',
      },
      {
        id: 'consensus_breakdown',
        systemPrompt:
          'You summarize where consensus exists and where views split. Use web search and scraping and return strict JSON with keys: topic, consensusPoints (array), disagreementPoints (array), confidence, asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Provide a sentiment consensus breakdown for:',
      },
    ],
  },
  '34': {
    id: '34',
    modelEnv: 'VENICE_MODEL_SENTIMENT_34',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'retail_crowd_bull_bear_ratio',
        systemPrompt:
          'You estimate retail crowd sentiment from public discussion signals. Use web search and scraping. Return strict JSON with keys: topic, bullBearRatio, sentiment {label, score}, retailSignals (array), asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Estimate retail crowd sentiment for:',
      },
      {
        id: 'catalyst_sentiment_timeline',
        systemPrompt:
          'You build a catalyst-linked sentiment timeline. Use web search and scraping and return strict JSON with keys: topic, timeline (array of {time, catalyst, sentiment}), summary, asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Build a catalyst sentiment timeline for:',
      },
    ],
  },
  '35': {
    id: '35',
    modelEnv: 'VENICE_MODEL_SENTIMENT_35',
    veniceParameters: {
      enable_web_search: 'on',
      enable_web_scraping: true,
      include_venice_system_prompt: false,
    },
    skills: [
      {
        id: 'sentiment_volatility_signal',
        systemPrompt:
          'You are a volatility-aware sentiment forecaster. Use web search and scraping to estimate sentiment stability and near-term risk of sharp swings. Return strict JSON with keys: topic, currentSentiment, volatilitySignal {level, rationale}, scenarios (array), asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Generate a sentiment volatility signal for:',
      },
      {
        id: 'downside_risk_sentiment',
        systemPrompt:
          'You identify sentiment-based downside risks. Use web search and scraping and return strict JSON with keys: topic, downsideRiskScore, riskDrivers (array), mitigationSignals (array), asOf (ISO timestamp), and sources (array of {title,url}).',
        userPrompt: 'Assess downside sentiment risk for:',
      },
    ],
  },
};

function buildDefaultAgentRuntime(agentId, card) {
  return {
    id: agentId,
    skills: card.skills.map((skill) => ({
      id: skill.id,
      systemPrompt:
        `You are ${card.name}. ${skill.description} ` +
        'Return strict JSON with keys: task, summary, findings (array), asOf (ISO timestamp), and sources (array of {title,url}).',
      userPrompt: `${skill.name}:`,
    })),
  };
}

for (const [agentId, card] of Object.entries(AGENT_CARDS)) {
  if (!AGENTS[agentId]) {
    AGENTS[agentId] = buildDefaultAgentRuntime(agentId, card);
  }
}
