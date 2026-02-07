import type { Provider } from "ethers";
import { fetchFromIpfs } from "./ipfs";
import { getTaskDescriptionUri } from "./tasks";

export const ONCHAIN_TASK_SPEC_V1 = "erc8001-task/v1" as const;

export interface OnchainTaskSpecV1 {
  version: typeof ONCHAIN_TASK_SPEC_V1;
  input: string;
  skill?: string;
  model?: string;
  client?: string;
  createdAt?: string;
}

export interface ParsedOnchainTaskSpec {
  version: typeof ONCHAIN_TASK_SPEC_V1 | "plain-text";
  input: string;
  skill?: string;
  model?: string;
}

export interface TaskSpecFromOnchainUri {
  descriptionURI: string;
  parsed: ParsedOnchainTaskSpec;
  rawContent: string;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseV1Object(value: Record<string, unknown>): ParsedOnchainTaskSpec | null {
  if (value.version !== ONCHAIN_TASK_SPEC_V1) return null;

  const input = asNonEmptyString(value.input);
  if (!input) {
    throw new Error("Invalid on-chain task spec: input is required for erc8001-task/v1");
  }

  const skill = asNonEmptyString(value.skill) ?? undefined;
  const model = asNonEmptyString(value.model) ?? undefined;

  return {
    version: ONCHAIN_TASK_SPEC_V1,
    input,
    ...(skill ? { skill } : {}),
    ...(model ? { model } : {}),
  };
}

export function parseOnchainTaskSpec(raw: unknown): ParsedOnchainTaskSpec {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error("Invalid on-chain task spec: empty content");
    }

    if (!trimmed.startsWith("{")) {
      return {
        version: "plain-text",
        input: trimmed,
      };
    }

    try {
      const parsedJson = JSON.parse(trimmed) as unknown;
      if (!isRecord(parsedJson)) {
        throw new Error("Invalid on-chain task spec: JSON content must be an object");
      }
      const parsed = parseV1Object(parsedJson);
      if (parsed) return parsed;
      throw new Error("Invalid on-chain task spec: unsupported JSON schema");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Invalid on-chain task spec:")
      ) {
        throw error;
      }
      throw new Error("Invalid on-chain task spec: malformed JSON content");
    }
  }

  if (isRecord(raw)) {
    const parsed = parseV1Object(raw);
    if (parsed) return parsed;
    throw new Error("Invalid on-chain task spec: unsupported JSON schema");
  }

  throw new Error("Invalid on-chain task spec: unsupported payload type");
}

export async function fetchTaskSpecFromOnchainUri(
  escrowAddress: string,
  provider: Provider,
  taskId: bigint,
  options?: { fromBlock?: number | bigint; gateway?: string }
): Promise<TaskSpecFromOnchainUri> {
  const descriptionURI = await getTaskDescriptionUri(
    escrowAddress,
    provider,
    taskId,
    options?.fromBlock
  );

  if (!descriptionURI) {
    throw new Error(`Task ${taskId.toString()} has no description URI in TaskCreated event`);
  }

  const fetched = await fetchFromIpfs(descriptionURI, {
    gateway: options?.gateway,
    asJson: false,
  });
  const rawContent = typeof fetched === "string" ? fetched : JSON.stringify(fetched);
  const parsed = parseOnchainTaskSpec(rawContent);

  return {
    descriptionURI,
    parsed,
    rawContent,
  };
}
