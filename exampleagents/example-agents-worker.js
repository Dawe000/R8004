// Multi-agent Cloudflare Worker for ERC8001 example agents (routes /1 through /10)
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
        { error: 'Unknown agent route. Use /1 through /10.' },
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
            `/${agentId}/telemetry`,
            `/${agentId}/a2a/tasks`,
            `/${agentId}/a2a/tasks/{taskId}/status`,
            `/${agentId}/a2a/tasks/{taskId}/result`,
            `/${agentId}/a2a/auction/join`,
            `/${agentId}/a2a/auction/{auctionId}/bid`,
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
      return handleTasks(request, env, corsHeaders, agent, segments);
    }

    if (segments[1] === 'a2a' && segments[2] === 'tasks') {
      return handleA2ATasks(request, env, corsHeaders, agent, segments);
    }

    if (segments[1] === 'a2a' && segments[2] === 'auction') {
      return handleA2AAuction(request, env, corsHeaders, agent, segments);
    }

    return jsonResponse(
      { error: 'Unknown endpoint for agent.', hint: 'Try /card or /tasks.' },
      404,
      corsHeaders
    );
  },
};

async function handleTasks(request, env, corsHeaders, agent, segments) {
  if (request.method === 'POST' && segments.length === 2) {
    return createTask(request, env, corsHeaders, agent);
  }

  if (request.method === 'GET' && segments.length === 3) {
    const taskId = segments[2];
    return jsonResponse(
      {
        id: taskId,
        status: 'completed',
        result: {
          summary: 'Example task status response.',
          agentId: agent.id,
        },
      },
      200,
      corsHeaders
    );
  }

  return jsonResponse(
    { error: 'Unsupported /tasks route.' },
    404,
    corsHeaders
  );
}

async function handleA2ATasks(request, env, corsHeaders, agent, segments) {
  if (request.method === 'POST' && segments.length === 3) {
    return createTask(request, env, corsHeaders, agent);
  }

  if (segments.length === 5 && segments[4] === 'status' && request.method === 'GET') {
    const taskId = segments[3];
    return jsonResponse(
      {
        taskId: taskId,
        status: 'completed',
        agentId: agent.id,
      },
      200,
      corsHeaders
    );
  }

  if (segments.length === 5 && segments[4] === 'result' && request.method === 'POST') {
    const taskId = segments[3];
    return jsonResponse(
      {
        taskId: taskId,
        status: 'received',
        message: 'Result accepted by example agent worker.',
      },
      200,
      corsHeaders
    );
  }

  return jsonResponse(
    { error: 'Unsupported /a2a/tasks route.' },
    404,
    corsHeaders
  );
}

async function handleA2AAuction(request, env, corsHeaders, agent, segments) {
  if (segments[3] === 'join' && request.method === 'POST' && segments.length === 4) {
    return handleAuctionJoin(request, corsHeaders, agent);
  }
  if (segments[4] === 'bid' && request.method === 'POST' && segments.length === 5) {
    const auctionId = segments[3];
    return handleAuctionBid(request, corsHeaders, agent, auctionId);
  }
  return jsonResponse(
    { error: 'Unsupported /a2a/auction route.' },
    404,
    corsHeaders
  );
}

function getAgentAuctionDefaults(agentId) {
  const baseMin = 100n;
  const baseAsk = 150n;
  const id = BigInt(agentId);
  return {
    minAmount: String(baseMin + id * 10n),
    ask: String(baseAsk + id * 10n),
  };
}

async function handleAuctionJoin(request, corsHeaders, agent) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  const { auctionId, taskSpec, paymentToken, taskDeadline, expiresAt } = body || {};
  if (!auctionId) {
    return jsonResponse({ error: 'Missing auctionId' }, 400, corsHeaders);
  }
  const { minAmount, ask } = getAgentAuctionDefaults(agent.id);
  const stakeAmount = '50';
  return jsonResponse(
    {
      agentId: agent.id,
      ask,
      minAmount,
      stakeAmount,
      taskDeadline: taskDeadline || null,
    },
    200,
    corsHeaders
  );
}

async function handleAuctionBid(request, corsHeaders, agent, auctionId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  const { minAmount, ask } = getAgentAuctionDefaults(agent.id);
  const marketState = body?.marketState;
  let newAsk = ask;
  if (marketState?.competingPrices && Array.isArray(marketState.competingPrices)) {
    const minCompeting = marketState.competingPrices.reduce((min, p) => {
      const val = BigInt(p.price || p);
      return min === null || val < min ? val : min;
    }, null);
    if (minCompeting !== null) {
      const floor = BigInt(minAmount);
      const undercut = minCompeting - 1n;
      newAsk = String(undercut > floor ? undercut : floor);
    }
  }
  return jsonResponse(
    {
      auctionId,
      agentId: agent.id,
      ask: newAsk,
      minAmount,
      message: 'Bid updated',
    },
    200,
    corsHeaders
  );
}

async function createTask(request, env, corsHeaders, agent) {
  try {
    const rawBody = await request.text();
    let body;

    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = { input: rawBody };
    }

    const taskId = crypto.randomUUID();
    const input = extractInput(body);

    if (!input) {
      throw new Error('No input provided for task');
    }

    const result = await processAgentTask(agent, body, input, env);

    return jsonResponse(
      {
        id: taskId,
        status: 'completed',
        input: input,
        result: result,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      200,
      corsHeaders
    );
  } catch (error) {
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

async function processAgentTask(agent, body, inputText, env) {
  const skillId =
    body?.task?.skill ??
    body?.skill ??
    body?.task?.capabilityId ??
    body?.capabilityId ??
    agent.skills[0].id;

  const skill = agent.skills.find((entry) => entry.id === skillId) || agent.skills[0];
  const systemPrompt = skill.systemPrompt;
  const userPrompt = `${skill.userPrompt}\n\n${inputText}`;

  const model = body?.task?.model || body?.model || env.VENICE_MODEL || 'llama-3.3-70b';
  const apiKey = env.VENICE_API_KEY;

  if (!apiKey) {
    throw new Error('Missing VENICE_API_KEY in environment');
  }

  const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1600,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Venice AI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const cleaned = stripCodeFences(content);

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
  };
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
};

const AGENTS = {
  '1': {
    id: '1',
    skills: [
      {
        id: 'security_analysis',
        systemPrompt:
          'You are a cybersecurity-focused code reviewer. Return JSON with keys: issues (array of {severity,type,description,location,fix}), summary, riskScore (1-10).',
        userPrompt: 'Analyze the following code for security issues:',
      },
      {
        id: 'performance_review',
        systemPrompt:
          'You are a performance engineer. Return JSON with keys: bottlenecks (array of {description,impact,fix}), summary, perfScore (1-10).',
        userPrompt: 'Analyze the following code for performance issues:',
      },
    ],
  },
  '2': {
    id: '2',
    skills: [
      {
        id: 'smart_contract_audit',
        systemPrompt:
          'You are a senior smart contract auditor. Return JSON with keys: findings (array of {severity,issue,impact,fix}), summary, confidence.',
        userPrompt: 'Audit this Solidity code for vulnerabilities:',
      },
      {
        id: 'gas_optimization',
        systemPrompt:
          'You are a gas optimization specialist. Return JSON with keys: optimizations (array of {description,gasImpact,change}), summary.',
        userPrompt: 'Review this Solidity code for gas optimizations:',
      },
    ],
  },
  '3': {
    id: '3',
    skills: [
      {
        id: 'exploratory_analysis',
        systemPrompt:
          'You are a data analyst. Return JSON with keys: highlights (array), anomalies (array), metrics (object), summary.',
        userPrompt: 'Analyze this dataset or summary:',
      },
      {
        id: 'dashboard_outline',
        systemPrompt:
          'You design dashboards. Return JSON with keys: charts (array of {title,type,metric}), layout, summary.',
        userPrompt: 'Propose a dashboard based on this dataset or goals:',
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
};
