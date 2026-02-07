import { AgentCapabilityCard, RankedAgent, TaskMatchRequest } from '../types';
import { VeniceService } from './venice';
import { AgentRegistry } from './agentRegistry';
import { TrustService } from './trust';
import { PineconeService } from './pinecone';

export class AgentMatcher {
	constructor(
		private veniceService: VeniceService,
		private pineconeService: PineconeService,
		private agentRegistry: AgentRegistry,
		private trustService?: TrustService
	) {}

	async matchAgents(request: TaskMatchRequest): Promise<RankedAgent[]> {
		const refinedQuery = await this.veniceService.refineQuery(request.query);
		const queryEmbedding = await this.veniceService.generateEmbedding(refinedQuery);
		const agents = this.agentRegistry.getAll();
		const agentById = new Map(agents.map((agent) => [agent.agentId, agent]));
		const pineconeMatches = await this.pineconeService.queryByVector(
			queryEmbedding,
			Math.max(agents.length, 10)
		);

		// Fetch all trust scores upfront if trust service is available
		let trustScores: Map<string, number> | undefined;
		if (this.trustService) {
			trustScores = await this.trustService.getAllTrustScores();
		}

		const scoredAgents = await Promise.all(
			pineconeMatches.map(async (match) => {
				const agent = agentById.get(match.id);
				if (!agent) {
					return null;
				}
				const semanticScore = match.score;
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

		const rankedAgents = scoredAgents.filter(
			(
				scored
			): scored is {
				agent: AgentCapabilityCard;
				score: number;
				trustScore: number;
				semanticScore: number;
			} => scored !== null
		);

		rankedAgents.sort((a, b) => b.score - a.score);

		return rankedAgents.slice(0, 5).map((scored) => {
			return {
				agent: scored.agent,
				score: scored.score,
				trustScore: scored.trustScore,
				reason: this.generateMatchReason(scored.semanticScore, scored.trustScore),
			};
		});
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
