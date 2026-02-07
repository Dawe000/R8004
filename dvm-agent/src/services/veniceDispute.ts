/**
 * Venice AI chat completion for UMA dispute resolution.
 * Follows marketmakeragent/src/services/venice.ts pattern.
 */

const VENICE_API_BASE = "https://api.venice.ai/api/v1";
const DISPUTE_MODEL = "zai-org-glm-4.7";

export type DisputeWinner = "agent" | "client";

export interface DisputeEvidence {
  taskDescription: string;
  clientEvidence: string;
  agentEvidence: string;
  agentResult: string;
}

export interface VeniceDisputeResult {
  winner: DisputeWinner;
  reason?: string;
  raw?: string;
}

export class VeniceDisputeService {
  constructor(private apiKey: string) {}

  async decideDispute(evidence: DisputeEvidence): Promise<VeniceDisputeResult> {
    const systemPrompt = `You are an impartial dispute resolver for agent task completion.
Given the task description, client evidence (why the client disputes), agent evidence (why the agent claims completion), and the agent's result,
decide who wins: the agent (if the task was completed correctly) or the client (if the client's dispute is valid).
Output ONLY a single line in this exact format:
WINNER: agent
REASON: <brief explanation>
or
WINNER: client
REASON: <brief explanation>
Do not output anything else.`;

    const userContent = `## Task description
${evidence.taskDescription}

## Client evidence (why client disputes)
${evidence.clientEvidence}

## Agent evidence (why agent claims completion)
${evidence.agentEvidence}

## Agent result
${evidence.agentResult}

Who wins: agent or client? Output WINNER: agent or WINNER: client, then REASON: <brief reason>.`;

    const request = {
      model: DISPUTE_MODEL,
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userContent },
      ],
      max_tokens: 300,
      temperature: 0.2,
      venice_parameters: {
        disable_thinking: true,
        include_venice_system_prompt: false,
      },
    };

    const response = await fetch(`${VENICE_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Venice chat error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };
    const raw = this.extractContent(data);
    return this.parseWinner(raw);
  }

  private extractContent(data: {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  }): string {
    const choice = data.choices?.[0]?.message?.content;
    if (typeof choice === "string") return choice.trim();
    if (Array.isArray(choice)) {
      return choice
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
    }
    return "";
  }

  private parseWinner(raw: string): VeniceDisputeResult {
    const reasonMatch = /reason:\s*(.+?)(?:\n|$)/is.exec(raw);
    const winnerMatch = /winner:\s*(agent|client)/i.exec(raw);
    if (winnerMatch) {
      const w = winnerMatch[1].toLowerCase() as DisputeWinner;
      return { winner: w, reason: reasonMatch?.[1]?.trim(), raw };
    }
    const lower = raw.toLowerCase();
    if (lower.includes("agent wins") || /^agent$/m.test(lower)) {
      return { winner: "agent", reason: reasonMatch?.[1]?.trim(), raw };
    }
    if (lower.includes("client wins") || /^client$/m.test(lower)) {
      return { winner: "client", reason: reasonMatch?.[1]?.trim(), raw };
    }
    // Default to client on parse failure (safer for disputed cases)
    return { winner: "client", reason: "Parse failure; defaulting to client", raw };
  }
}
