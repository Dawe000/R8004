export interface AgentCapabilityCard {
	agentId: string;
	capabilityId?: string;
	name: string;
	description: string;
	supportedDomains?: string[];
	maxConcurrentTasks?: number;
	url?: string;
	skills?: Array<{
		id: string;
		name: string;
		description: string;
		tags?: string[];
	}>;
	sla?: {
		minAcceptanceStake: string;
		avgCompletionTimeSeconds: number;
		maxCompletionTimeSeconds: number;
	};
	endpoints?: {
		a2a: string;
		status?: string;
		telemetry?: string;
	};
	auth?: {
		scheme: 'bearer' | 'signature' | 'none';
		publicKey?: string;
	};
	embedding?: number[];
}

export interface TaskMatchRequest {
	query: string;
	paymentAmount?: string;
	paymentToken?: string;
	deadline?: number;
	minReputationScore?: number;
	requiredCapabilities?: string[];
}

export interface RankedAgent {
	agent: AgentCapabilityCard;
	score: number;
	trustScore: number;
	reason: string;
}

export interface TaskMatchResponse {
	query: string;
	agents: RankedAgent[];
	matchStrategy: string;
}

export interface VeniceEmbeddingRequest {
	model: string;
	input: string;
	encoding_format: 'float';
}

export interface VeniceEmbeddingResponse {
	object: 'list';
	data: Array<{
		object: 'embedding';
		embedding: number[];
		index: number;
	}>;
	model: string;
	usage: {
		prompt_tokens: number;
		total_tokens: number;
	};
}
