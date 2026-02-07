import {
	VeniceChatCompletionRequest,
	VeniceChatCompletionResponse,
	VeniceEmbeddingRequest,
	VeniceEmbeddingResponse,
} from '../types';

const VENICE_API_BASE = 'https://api.venice.ai/api/v1';
const EMBEDDING_MODEL = 'text-embedding-bge-m3';
const QUERY_REWRITE_MODEL = 'zai-org-glm-4.7';

export class VeniceService {
	constructor(private apiKey: string) {}

	async refineQuery(text: string): Promise<string> {
		const trimmed = text.trim();
		if (!trimmed) {
			return trimmed;
		}

		const request: VeniceChatCompletionRequest = {
			model: QUERY_REWRITE_MODEL,
			messages: [
				{
					role: 'system',
					content:
						'Rewrite the user request into a concise, well-formed sentence using correct terminology. Preserve intent and do not add requirements. Output only the rewritten query. If the query is already well formed, and uses the correct terminology, your output can be identical or very similar.',
				},
				{
					role: 'user',
					content: trimmed,
				},
			],
			max_tokens: 200,
			temperature: 0.2,
			venice_parameters: {
				disable_thinking: true,
				include_venice_system_prompt: false,
			},
		};

		try {
			const response = await fetch(`${VENICE_API_BASE}/chat/completions`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(request),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Venice chat error: ${response.status} ${errorText}`);
			}

			const data = (await response.json()) as VeniceChatCompletionResponse;
			const content = this.extractChatContent(data);
			return content || trimmed;
		} catch (error) {
			console.warn('Falling back to original query due to refinement error:', error);
			return trimmed;
		}
	}

	async generateEmbedding(text: string): Promise<number[]> {
		const request: VeniceEmbeddingRequest = {
			model: EMBEDDING_MODEL,
			input: text,
			encoding_format: 'float',
		};

		const response = await fetch(`${VENICE_API_BASE}/embeddings`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			throw new Error(`Venice API error: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as VeniceEmbeddingResponse;

		if (!data.data || data.data.length === 0) {
			throw new Error('No embedding returned from Venice API');
		}

		return data.data[0].embedding;
	}

	async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
		return Promise.all(texts.map((text) => this.generateEmbedding(text)));
	}

	private extractChatContent(data: VeniceChatCompletionResponse): string {
		const choice = data.choices?.[0]?.message?.content;
		if (typeof choice === 'string') {
			return choice.trim();
		}
		if (Array.isArray(choice)) {
			return choice
				.map((part) => (typeof part?.text === 'string' ? part.text : ''))
				.join('\n')
				.trim();
		}
		return '';
	}
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error('Vectors must have same dimension');
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
