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

		const top5 = rankedAgents.slice(0, 5).map((scored) => {
			return {
				agent: scored.agent,
				score: scored.score,
				trustScore: scored.trustScore,
				reason: this.generateMatchReason(scored.semanticScore, scored.trustScore),
			};
		});

		// LLM re-ranking for top 3 agents based on query-agent fit
		if (top5.length >= 3) {
			try {
				const rerankedTop3 = await this.rerankTop3WithLLM(refinedQuery, top5.slice(0, 3));
				return [...rerankedTop3, ...top5.slice(3)];
			} catch (error) {
				console.warn('LLM reranking failed, using original order:', error);
				return top5;
			}
		}

		return top5;
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

	private async rerankTop3WithLLM(
		query: string,
		top3: RankedAgent[]
	): Promise<RankedAgent[]> {
		const prompt = `Task Query: "${query}"

Candidate Agents:
${top3
	.map(
		(ra, idx) => `
${idx + 1}. ${ra.agent.name}
   Description: ${ra.agent.description}
   Skills: ${ra.agent.skills?.map((s) => s.name).join(', ') || 'N/A'}
   Domains: ${ra.agent.supportedDomains?.join(', ') || 'N/A'}
   Trust Score: ${(ra.trustScore * 100).toFixed(0)}/100
   Match Score: ${(ra.score * 100).toFixed(0)}/100
`
	)
	.join('\n')}

Rerank these 3 agents by relevance to the task query. Consider:
- Direct capability match for the specific task
- Domain expertise alignment
- Skill set applicability to the query

Output ONLY the reranked order as comma-separated numbers (e.g., "2,1,3" if agent 2 is best match for the query).`;

		const response = await this.veniceService.rerankAgents(prompt);

		// Parse response like "2,1,3"
		const order = response
			.trim()
			.split(',')
			.map((n: string) => parseInt(n.trim()) - 1) // Convert to 0-indexed
			.filter((idx: number) => idx >= 0 && idx < 3);

		// Validate we got exactly 3 unique indices
		if (order.length !== 3 || new Set(order).size !== 3) {
			console.warn('Invalid LLM reranking response, using original order');
			return top3;
		}

		return order.map((idx: number) => top3[idx]);
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
