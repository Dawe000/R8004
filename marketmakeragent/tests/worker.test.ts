import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { Env } from '../src/index';

const executionContext = {
	waitUntil: (_promise: Promise<unknown>) => {},
	passThroughOnException: () => {},
} as ExecutionContext;

function createEnv(overrides: Partial<Env> = {}): Env {
	return {
		VENICE_API_KEY: 'venice-test-key',
		PINECONE_API_KEY: 'pinecone-test-key',
		PINECONE_INDEX_HOST: 'https://pinecone.local',
		ENVIRONMENT: 'test',
		AGENTS_WORKER_URL: 'https://agents.local',
		TRUST_API_URL: 'https://trust.local',
		...overrides,
	};
}

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function installFetchMock(
	handler: (url: URL, init: RequestInit | undefined) => Promise<Response> | Response
): () => void {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const rawUrl =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		return handler(new URL(rawUrl), init);
	}) as typeof fetch;
	return () => {
		globalThis.fetch = originalFetch;
	};
}

test('GET /health returns service status', async () => {
	const response = await worker.fetch(
		new Request('http://localhost/health'),
		createEnv(),
		executionContext
	);
	assert.equal(response.status, 200);
	const data = (await response.json()) as { status: string; service: string };
	assert.equal(data.status, 'ok');
	assert.equal(data.service, 'market-maker-agent');
});

test('POST /api/match-agents fails when Pinecone key is missing', async () => {
	const response = await worker.fetch(
		new Request('http://localhost/api/match-agents', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'Find me an agent' }),
		}),
		createEnv({ PINECONE_API_KEY: '' }),
		executionContext
	);
	assert.equal(response.status, 500);
	const data = (await response.json()) as { error: string };
	assert.equal(data.error, 'PINECONE_API_KEY not configured');
});

test('POST /api/match-agents validates query body', async () => {
	const response = await worker.fetch(
		new Request('http://localhost/api/match-agents', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: '' }),
		}),
		createEnv(),
		executionContext
	);
	assert.equal(response.status, 400);
	const data = (await response.json()) as { error: string };
	assert.equal(data.error, 'Invalid query: must be a non-empty string');
});

test('POST /api/match-agents returns ranked agents using Pinecone matches', async () => {
	let veniceCalls = 0;
	let veniceRewriteCalls = 0;
	let pineconeCalls = 0;
	let agentsListCalls = 0;

	const restoreFetch = installFetchMock(async (url, init) => {
		const asString = url.toString();

		if (asString === 'https://api.venice.ai/api/v1/embeddings') {
			veniceCalls += 1;
			return jsonResponse({
				object: 'list',
				data: [{ object: 'embedding', embedding: [0.11, 0.22, 0.33], index: 0 }],
				model: 'text-embedding-bge-m3',
				usage: { prompt_tokens: 5, total_tokens: 5 },
			});
		}

		if (asString === 'https://api.venice.ai/api/v1/chat/completions') {
			veniceRewriteCalls += 1;
			return jsonResponse({
				model: 'zai-org-glm-4.7',
				choices: [{ message: { content: 'Refined query for testing.' } }],
				usage: { prompt_tokens: 10, total_tokens: 20 },
			});
		}

		if (asString === 'https://agents.local/') {
			agentsListCalls += 1;
			return jsonResponse({ routes: ['/1', '/2', '/not-a-number'] });
		}

		if (asString === 'https://agents.local/1/card') {
			return jsonResponse({
				name: 'Agent One',
				description: 'Research specialist',
				url: 'https://example.com/agent-1',
				skills: [{ id: 'research', name: 'Research', description: 'Research tasks', tags: ['research'] }],
			});
		}

		if (asString === 'https://agents.local/2/card') {
			return jsonResponse({
				name: 'Agent Two',
				description: 'Market specialist',
				url: 'https://example.com/agent-2',
				skills: [{ id: 'market', name: 'Market', description: 'Market tasks', tags: ['market'] }],
			});
		}

		if (asString === 'https://trust.local/trust') {
			return jsonResponse({
				agents: [
					{ agentId: '1', score: 90, signals: null, updatedAt: 1738800000 },
					{ agentId: '2', score: 40, signals: null, updatedAt: 1738800000 },
				],
			});
		}

		if (asString === 'https://pinecone.local/query') {
			pineconeCalls += 1;
			assert.equal(init?.method, 'POST');
			const parsedBody = JSON.parse((init?.body as string) || '{}') as { topK?: number };
			assert.equal(parsedBody.topK, 10);
			return jsonResponse({
				matches: [
					{ id: '2', score: 0.92 },
					{ id: '1', score: 0.89 },
				],
			});
		}

		return new Response(`No mock configured for ${asString}`, { status: 404 });
	});

	try {
		const response = await worker.fetch(
			new Request('http://localhost/api/match-agents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: 'Need a market research summary' }),
			}),
			createEnv(),
			executionContext
		);

		assert.equal(response.status, 200);
		const payload = (await response.json()) as {
			matchStrategy: string;
			agents: Array<{ agent: { agentId: string }; score: number }>;
		};
		assert.equal(payload.matchStrategy, 'semantic-pinecone-cosine-similarity');
		assert.equal(payload.agents.length, 2);
		assert.equal(payload.agents[0].agent.agentId, '1');
		assert.equal(payload.agents[1].agent.agentId, '2');
		assert.ok(payload.agents[0].score > payload.agents[1].score);
		assert.equal(veniceRewriteCalls, 1);
		assert.equal(veniceCalls, 1);
		assert.equal(pineconeCalls, 1);
		assert.equal(agentsListCalls, 1);
	} finally {
		restoreFetch();
	}
});

test('POST /api/match-agents returns 500 when Pinecone query fails', async () => {
	const restoreFetch = installFetchMock(async (url) => {
		const asString = url.toString();

		if (asString === 'https://api.venice.ai/api/v1/chat/completions') {
			return jsonResponse({
				model: 'zai-org-glm-4.7',
				choices: [{ message: { content: 'Refined query for testing.' } }],
			});
		}

		if (asString === 'https://api.venice.ai/api/v1/embeddings') {
			return jsonResponse({
				object: 'list',
				data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }],
				model: 'text-embedding-bge-m3',
				usage: { prompt_tokens: 2, total_tokens: 2 },
			});
		}

		if (asString === 'https://agents.local/') {
			return jsonResponse({ routes: ['/1'] });
		}

		if (asString === 'https://agents.local/1/card') {
			return jsonResponse({
				name: 'Agent One',
				description: 'Research specialist',
				url: 'https://example.com/agent-1',
				skills: [{ id: 'research', name: 'Research', description: 'Research tasks', tags: ['research'] }],
			});
		}

		if (asString === 'https://pinecone.local/query') {
			return new Response('temporary failure', { status: 500 });
		}

		return new Response(`No mock configured for ${asString}`, { status: 404 });
	});

	try {
		const response = await worker.fetch(
			new Request('http://localhost/api/match-agents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: 'Need a specialist' }),
			}),
			createEnv({ TRUST_API_URL: undefined }),
			executionContext
		);

		assert.equal(response.status, 500);
		const payload = (await response.json()) as { error: string; details: string };
		assert.equal(payload.error, 'Failed to match agents');
		assert.match(payload.details, /Pinecone query failed/);
	} finally {
		restoreFetch();
	}
});

test('POST /api/agents/:id/erc8001/dispatch returns 404 (execution proxy removed)', async () => {
	const response = await worker.fetch(
		new Request('http://localhost/api/agents/1/erc8001/dispatch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				onchainTaskId: '42',
				stakeAmountWei: '1000',
			}),
		}),
		createEnv(),
		executionContext
	);

	assert.equal(response.status, 404);
});

test('POST /api/agents/:id/erc8001/payment-deposited returns 404 (execution proxy removed)', async () => {
	const response = await worker.fetch(
		new Request('http://localhost/api/agents/1/erc8001/payment-deposited', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ onchainTaskId: '42' }),
		}),
		createEnv(),
		executionContext
	);

	assert.equal(response.status, 404);
});
