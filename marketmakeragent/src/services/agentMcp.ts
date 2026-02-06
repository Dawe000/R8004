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
		const response = await fetch(`${this.baseUrl}/${agentId}/card`);
		if (!response.ok) {
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
		const agentIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
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
