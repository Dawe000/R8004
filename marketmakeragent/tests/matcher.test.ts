import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRegistry } from '../src/services/agentRegistry';
import { AgentMatcher } from '../src/services/matcher';
import { AgentCapabilityCard } from '../src/types';

test('AgentMatcher ranks by semantic + trust score and ignores unknown Pinecone IDs', async () => {
	const agents: AgentCapabilityCard[] = [
		{ agentId: '1', name: 'Agent One', description: 'Handles research' },
		{ agentId: '2', name: 'Agent Two', description: 'Handles market data' },
	];

	let veniceCalls = 0;
	const veniceService = {
		refineQuery: async (text: string) => text,
		generateEmbedding: async (_text: string) => {
			veniceCalls += 1;
			return [0.1, 0.2, 0.3];
		},
	};

	const pineconeService = {
		queryByVector: async (_vector: number[], _topK: number) => [
			{ id: '2', score: 0.94 },
			{ id: 'unknown-id', score: 0.99 },
			{ id: '1', score: 0.86 },
		],
	};

	const trustService = {
		getAllTrustScores: async () => new Map<string, number>([['1', 95], ['2', 30]]),
	};

	const matcher = new AgentMatcher(
		veniceService as any,
		pineconeService as any,
		new AgentRegistry(agents),
		trustService as any
	);

	const result = await matcher.matchAgents({ query: 'Need market research support' });

	assert.equal(veniceCalls, 1);
	assert.equal(result.length, 2);
	assert.equal(result[0].agent.agentId, '1');
	assert.equal(result[1].agent.agentId, '2');
	assert.ok(result[0].score > result[1].score);
});

test('AgentMatcher uses default trust score when trust service is not provided', async () => {
	const agents: AgentCapabilityCard[] = [
		{ agentId: '1', name: 'Agent One', description: 'Handles research' },
	];

	const veniceService = {
		refineQuery: async (text: string) => text,
		generateEmbedding: async (_text: string) => [0.2, 0.4],
	};

	const pineconeService = {
		queryByVector: async (_vector: number[], _topK: number) => [{ id: '1', score: 0.8 }],
	};

	const matcher = new AgentMatcher(
		veniceService as any,
		pineconeService as any,
		new AgentRegistry(agents)
	);

	const result = await matcher.matchAgents({ query: 'Find the best agent' });
	assert.equal(result.length, 1);
	assert.equal(result[0].trustScore, 0.75);
});
