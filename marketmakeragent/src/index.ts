import { TaskMatchRequest, TaskMatchResponse } from './types';
import { VeniceService } from './services/venice';
import { AgentRegistry } from './services/agentRegistry';
import { AgentMatcher } from './services/matcher';
import { TrustService } from './services/trust';
import { handleAgentMcpRoutes } from './api/agentMcpEndpoints';

export interface Env {
	VENICE_API_KEY: string;
	ENVIRONMENT: string;
	AGENTS_WORKER_URL?: string;
	TRUST_API_URL?: string;
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(request.url);

		if (url.pathname === '/health') {
			return new Response(
				JSON.stringify({ status: 'ok', service: 'market-maker-agent', env: env.ENVIRONMENT }),
				{
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				}
			);
		}

		if (url.pathname === '/api/match-agents' && request.method === 'POST') {
			try {
				if (!env.VENICE_API_KEY) {
					return new Response(
						JSON.stringify({ error: 'VENICE_API_KEY not configured' }),
						{
							status: 500,
							headers: { ...corsHeaders, 'Content-Type': 'application/json' },
						}
					);
				}

				const body = (await request.json()) as TaskMatchRequest;

				if (!body.query || typeof body.query !== 'string') {
					return new Response(
						JSON.stringify({ error: 'Invalid query: must be a non-empty string' }),
						{
							status: 400,
							headers: { ...corsHeaders, 'Content-Type': 'application/json' },
						}
					);
				}

				const veniceService = new VeniceService(env.VENICE_API_KEY);

				// Fetch agents from worker
				const agentBaseUrl = env.AGENTS_WORKER_URL || 'https://example-agent.lynethlabs.workers.dev';
				const { AgentRegistryFetcher } = await import('./services/agentRegistryFetcher');
				const fetcher = new AgentRegistryFetcher(agentBaseUrl);
				const fetchedAgents = await fetcher.fetchAllAgents();

				if (fetchedAgents.length === 0) {
					return new Response(
						JSON.stringify({ error: 'No agents available in registry' }),
						{
							status: 503,
							headers: { ...corsHeaders, 'Content-Type': 'application/json' },
						}
					);
				}

				const agentRegistry = new AgentRegistry(fetchedAgents);

				// Initialize trust service if URL is provided
				const trustService = env.TRUST_API_URL ? new TrustService(env.TRUST_API_URL) : undefined;

				const matcher = new AgentMatcher(veniceService, agentRegistry, trustService);

				const rankedAgents = await matcher.matchAgents(body);

				const response: TaskMatchResponse = {
					query: body.query,
					agents: rankedAgents,
					matchStrategy: 'semantic-embedding-cosine-similarity',
				};

				return new Response(JSON.stringify(response, null, 2), {
					status: 200,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return new Response(
					JSON.stringify({ error: 'Failed to match agents', details: errorMessage }),
					{
						status: 500,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' },
					}
				);
			}
		}

		// Try MCP agent routes
		const agentBaseUrl = env.AGENTS_WORKER_URL || 'https://example-agent.lynethlabs.workers.dev';
		const mcpResponse = await handleAgentMcpRoutes(request, url.pathname, agentBaseUrl);
		if (mcpResponse) {
			return mcpResponse;
		}

		return new Response('Not Found', { status: 404, headers: corsHeaders });
	},
};
