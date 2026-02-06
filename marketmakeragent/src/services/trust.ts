export interface TrustScore {
	agentId: string;
	score: number;
	signals: {
		tasksCompleted?: number;
		disputes?: number;
	} | null;
	updatedAt: number;
}

export class TrustService {
	constructor(private baseUrl: string) {}

	async getTrustScore(agentId: string): Promise<number> {
		try {
			const response = await fetch(`${this.baseUrl}/trust/${agentId}`);
			if (!response.ok) {
				console.warn(`Failed to fetch trust score for agent ${agentId}, using default`);
				return 75; // Default trust score
			}
			const data = (await response.json()) as TrustScore;
			return data.score;
		} catch (error) {
			console.error(`Error fetching trust score for agent ${agentId}:`, error);
			return 75; // Default trust score
		}
	}

	async getAllTrustScores(): Promise<Map<string, number>> {
		try {
			const response = await fetch(`${this.baseUrl}/trust`);
			if (!response.ok) {
				console.warn('Failed to fetch all trust scores, using defaults');
				return new Map();
			}
			const data = (await response.json()) as { agents: TrustScore[] };
			const trustMap = new Map<string, number>();
			data.agents.forEach((agent) => {
				trustMap.set(agent.agentId, agent.score);
			});
			return trustMap;
		} catch (error) {
			console.error('Error fetching all trust scores:', error);
			return new Map();
		}
	}
}
