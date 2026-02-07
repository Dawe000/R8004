export interface AgentTaskRequest {
	input: string;
	skill?: string;
	model?: string;
}

export interface AgentTaskResult {
	id: string;
	status: string;
	input: string;
	result: {
		agentId: string;
		skill: string;
		model: string;
		output: any;
		raw?: string;
	};
	createdAt: string;
	completedAt: string;
}

export class AgentMcpClient {
	constructor(private baseUrl: string = 'https://example-agent.lynethlabs.workers.dev') {}

	async getAgentCard(agentId: string): Promise<any> {
		const url = `${this.baseUrl}/${agentId}/card`;
		console.log(`Fetching agent card from: ${url}`);
		const response = await fetch(url);
		console.log(`Response status for agent ${agentId}: ${response.status}`);
		if (!response.ok) {
			const text = await response.text();
			console.error(`Failed to fetch agent ${agentId} from ${url}: ${response.status} - ${text}`);
			throw new Error(`Failed to fetch agent card: ${response.status}`);
		}
		return response.json();
	}

	async checkAgentHealth(agentId: string): Promise<{ status: string; service: string }> {
		const response = await fetch(`${this.baseUrl}/${agentId}/health`);
		if (!response.ok) {
			throw new Error(`Agent health check failed: ${response.status}`);
		}
		return response.json();
	}

	async executeTask(agentId: string, request: AgentTaskRequest): Promise<AgentTaskResult> {
		const response = await fetch(`${this.baseUrl}/${agentId}/tasks`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Agent task execution failed: ${response.status} ${errorText}`);
		}

		return response.json();
	}

	async executeA2ATask(agentId: string, request: AgentTaskRequest): Promise<AgentTaskResult> {
		const response = await fetch(`${this.baseUrl}/${agentId}/a2a/tasks`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`A2A task execution failed: ${response.status} ${errorText}`);
		}

		return response.json();
	}

	async getTaskStatus(agentId: string, taskId: string): Promise<any> {
		const response = await fetch(`${this.baseUrl}/${agentId}/a2a/tasks/${taskId}/status`);
		if (!response.ok) {
			throw new Error(`Failed to get task status: ${response.status}`);
		}
		return response.json();
	}

	async submitTaskResult(agentId: string, taskId: string, result: any): Promise<any> {
		const response = await fetch(`${this.baseUrl}/${agentId}/a2a/tasks/${taskId}/result`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(result),
		});

		if (!response.ok) {
			throw new Error(`Failed to submit task result: ${response.status}`);
		}

		return response.json();
	}

	async getTelemetry(agentId: string): Promise<any> {
		const response = await fetch(`${this.baseUrl}/${agentId}/telemetry`);
		if (!response.ok) {
			throw new Error(`Failed to get telemetry: ${response.status}`);
		}
		return response.json();
	}

	async listAllAgents(): Promise<string[]> {
		const response = await fetch(`${this.baseUrl}/`);
		if (!response.ok) {
			throw new Error(`Failed to list agents: ${response.status}`);
		}

		const data = (await response.json()) as { routes?: string[] };
		if (!Array.isArray(data.routes)) {
			throw new Error('Agent list response missing routes array');
		}

		const agentIds = data.routes
			.map((route) => String(route).replace(/^\//, ''))
			.filter((id) => /^\d+$/.test(id));
		if (agentIds.length === 0) {
			throw new Error('No agent IDs discovered from agents worker');
		}

		return agentIds;
	}

	async getAllAgentCards(): Promise<any[]> {
		const agentIds = await this.listAllAgents();
		const cards = await Promise.all(
			agentIds.map(async (id) => {
				try {
					return await this.getAgentCard(id);
				} catch (error) {
					console.error(`Failed to fetch agent ${id}:`, error);
					return null;
				}
			})
		);
		return cards.filter((card) => card !== null);
	}
}
