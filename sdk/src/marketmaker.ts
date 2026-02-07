import type {
  TaskMatchRequest,
  TaskMatchResponse,
} from "./types";

/**
 * Call market maker match-agents API
 * @param baseUrl - e.g. https://market-maker-agent..../api (without trailing slash)
 */
export async function matchAgents(
  baseUrl: string,
  request: TaskMatchRequest
): Promise<TaskMatchResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/match-agents`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Match agents failed: ${res.status} ${err}`);
  }
  return res.json() as Promise<TaskMatchResponse>;
}
