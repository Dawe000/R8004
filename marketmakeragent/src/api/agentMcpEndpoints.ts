import { AgentMcpClient, AgentTaskRequest } from '../services/agentMcp';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

export async function handleAgentMcpRoutes(
	request: Request,
	pathname: string,
	agentBaseUrl: string
): Promise<Response | null> {
	const mcpClient = new AgentMcpClient(agentBaseUrl);

	if (pathname === '/api/agents/list') {
		const agentIds = await mcpClient.listAllAgents();
		return new Response(JSON.stringify({ agents: agentIds }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
		});
	}

	if (pathname === '/api/agents/cards') {
		try {
			const cards = await mcpClient.getAllAgentCards();
			return new Response(JSON.stringify({ cards }), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({ error: 'Failed to fetch agent cards', details: (error as Error).message }),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				}
			);
		}
	}

	const agentCardMatch = pathname.match(/^\/api\/agents\/(\d+)\/card$/);
	if (agentCardMatch) {
		const agentId = agentCardMatch[1];
		try {
			const card = await mcpClient.getAgentCard(agentId);
			return new Response(JSON.stringify(card), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({ error: 'Failed to fetch agent card', details: (error as Error).message }),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				}
			);
		}
	}

	const agentHealthMatch = pathname.match(/^\/api\/agents\/(\d+)\/health$/);
	if (agentHealthMatch) {
		const agentId = agentHealthMatch[1];
		try {
			const health = await mcpClient.checkAgentHealth(agentId);
			return new Response(JSON.stringify(health), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({ error: 'Health check failed', details: (error as Error).message }),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				}
			);
		}
	}

	const agentTaskMatch = pathname.match(/^\/api\/agents\/(\d+)\/tasks$/);
	if (agentTaskMatch && request.method === 'POST') {
		const agentId = agentTaskMatch[1];
		try {
			const taskRequest = (await request.json()) as AgentTaskRequest;
			const result = await mcpClient.executeTask(agentId, taskRequest);
			return new Response(JSON.stringify(result), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({ error: 'Task execution failed', details: (error as Error).message }),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				}
			);
		}
	}

	const agentA2ATaskMatch = pathname.match(/^\/api\/agents\/(\d+)\/a2a\/tasks$/);
	if (agentA2ATaskMatch && request.method === 'POST') {
		const agentId = agentA2ATaskMatch[1];
		try {
			const taskRequest = (await request.json()) as AgentTaskRequest;
			const result = await mcpClient.executeA2ATask(agentId, taskRequest);
			return new Response(JSON.stringify(result), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			return new Response(
				JSON.stringify({ error: 'A2A task execution failed', details: (error as Error).message }),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				}
			);
		}
	}

	return null;
}
