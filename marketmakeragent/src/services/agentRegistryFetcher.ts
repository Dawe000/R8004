import { AgentCapabilityCard } from '../types';
import { AgentMcpClient } from './agentMcp';

export class AgentRegistryFetcher {
	private mcpClient: AgentMcpClient;

	constructor(baseUrl: string) {
		this.mcpClient = new AgentMcpClient(baseUrl);
	}

	async fetchAllAgents(): Promise<AgentCapabilityCard[]> {
		const agentIds = await this.mcpClient.listAllAgents();
		const agents: AgentCapabilityCard[] = [];

		await Promise.all(
			agentIds.map(async (id) => {
				try {
					const card = await this.mcpClient.getAgentCard(id);
					if (card) {
						agents.push(this.normalizeAgentCard(card, id));
					}
				} catch (error) {
					console.error(`Failed to fetch agent ${id}:`, error);
				}
			})
		);

		return agents;
	}

	private normalizeAgentCard(card: any, agentId: string): AgentCapabilityCard {
		const skillTags = card.skills?.flatMap((skill: any) => skill.tags || []) || [];

		// Calculate average stake from skills
		const avgStake = card.skills?.length > 0
			? card.skills.reduce((sum: number, skill: any) => sum + (skill.stake || 0), 0) / card.skills.length
			: 0.001;

		return {
			agentId,
			name: card.name || `Agent ${agentId}`,
			description: card.description || '',
			url: card.url,
			skills: card.skills || [],
			supportedDomains: Array.from(new Set(skillTags)),
			maxConcurrentTasks: 5,
			sla: {
				minAcceptanceStake: (avgStake * 1e18).toString(),
				avgCompletionTimeSeconds: 300,
				maxCompletionTimeSeconds: 900,
			},
			endpoints: {
				a2a: `${this.mcpClient['baseUrl']}/${agentId}/a2a/tasks`,
				status: `${this.mcpClient['baseUrl']}/${agentId}/a2a/tasks`,
				telemetry: `${this.mcpClient['baseUrl']}/${agentId}/telemetry`,
			},
			auth: {
				scheme: 'none',
			},
		};
	}
}
