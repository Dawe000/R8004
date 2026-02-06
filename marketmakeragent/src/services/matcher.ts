import { AgentCapabilityCard, RankedAgent, TaskMatchRequest } from '../types';
import { VeniceService, cosineSimilarity } from './venice';
import { AgentRegistry } from './agentRegistry';
import { TrustService } from './trust';

export class AgentMatcher {
	constructor(
		private veniceService: VeniceService,
		private agentRegistry: AgentRegistry,
		private trustService?: TrustService
	) {}

	async matchAgents(request: TaskMatchRequest): Promise<RankedAgent[]> {
		const queryEmbedding = await this.veniceService.generateEmbedding(request.query);
		const agents = this.agentRegistry.getAll();

		// Fetch all trust scores upfront if trust service is available
		let trustScores: Map<string, number> | undefined;
		if (this.trustService) {
			trustScores = await this.trustService.getAllTrustScores();
		}

		const scoredAgents = await Promise.all(
			agents.map(async (agent) => {
				const agentText = this.agentToText(agent);

				if (!agent.embedding) {
					agent.embedding = await this.veniceService.generateEmbedding(agentText);
				}

				const semanticScore = cosineSimilarity(queryEmbedding, agent.embedding);
				const trustScore = await this.getTrustScore(agent, trustScores);
				const combinedScore = semanticScore * 0.7 + trustScore * 0.3;

				return {
					agent,
					score: combinedScore,
					trustScore,
					semanticScore,
				};
			})
		);

		scoredAgents.sort((a, b) => b.score - a.score);

		return scoredAgents.slice(0, 5).map((scored) => {
			// Remove embedding from agent card for cleaner API response
			const { embedding, ...agentWithoutEmbedding } = scored.agent;
			return {
				agent: agentWithoutEmbedding,
				score: scored.score,
				trustScore: scored.trustScore,
				reason: this.generateMatchReason(scored.semanticScore, scored.trustScore),
			};
		});
	}

	private agentToText(agent: AgentCapabilityCard): string {
		const domains = agent.supportedDomains?.join(', ') || '';
		const skillsText = agent.skills?.map((s) => s.name).join(', ') || '';
		return `${agent.name}. ${agent.description} Capabilities: ${domains || skillsText}`;
	}

	private async getTrustScore(
		agent: AgentCapabilityCard,
		trustScores?: Map<string, number>
	): Promise<number> {
		// Use trust scores from Trust API database
		if (trustScores && trustScores.has(agent.agentId)) {
			const apiScore = trustScores.get(agent.agentId)!;
			return apiScore / 100; // Normalize 0-100 to 0-1
		}

		// Default to 75/100 if no trust score available
		return 0.75;
	}

	private generateMatchReason(semanticScore: number, trustScore: number): string {
		if (semanticScore > 0.8) {
			return 'Excellent capability match with strong trust rating';
		} else if (semanticScore > 0.6) {
			return 'Good capability match';
		} else if (trustScore > 0.8) {
			return 'High trust score with moderate capability match';
		} else {
			return 'Available agent with acceptable ratings';
		}
	}
}
