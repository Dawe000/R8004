import { keccak256, toUtf8Bytes, getBytes } from "ethers";
import type { IpfsConfig } from "./config";
import { DEFAULT_IPFS_URI_SCHEME } from "./config";
import type { Task } from "./types";

const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/** Convert IPFS URI to gateway URL */
function ipfsUriToGatewayUrl(
  uri: string,
  gateway: string = DEFAULT_IPFS_GATEWAY
): string {
  uri = uri.trim();
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice(7);
    return `${gateway.replace(/\/$/, "")}/${cid}`;
  }
  if (uri.includes("/ipfs/")) {
    return uri;
  }
  return `${gateway.replace(/\/$/, "")}/${uri}`;
}

/**
 * Fetch content from IPFS URI.
 * Supports ipfs://CID or https://gateway/ipfs/CID. No API key needed.
 */
export async function fetchFromIpfs(
  uri: string,
  options?: { gateway?: string; asJson?: boolean }
): Promise<string | unknown> {
  const trimmed = uri?.trim();
  if (!trimmed) {
    throw new Error("fetchFromIpfs: empty URI");
  }
  const url = ipfsUriToGatewayUrl(trimmed, options?.gateway ?? DEFAULT_IPFS_GATEWAY);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetchFromIpfs: ${res.status} ${res.statusText} for ${uri}`);
  }
  const text = await res.text();
  if (options?.asJson) {
    return JSON.parse(text) as unknown;
  }
  return text;
}

/** Fetch content at client evidence URI (wrapper over fetchFromIpfs) */
export async function fetchClientEvidence(
  uri: string,
  options?: { gateway?: string; asJson?: boolean }
): Promise<string | unknown | null> {
  const trimmed = uri?.trim();
  if (!trimmed) return null;
  return fetchFromIpfs(trimmed, options);
}

/** Fetch content at agent evidence URI (wrapper over fetchFromIpfs) */
export async function fetchAgentEvidence(
  uri: string,
  options?: { gateway?: string; asJson?: boolean }
): Promise<string | unknown | null> {
  const trimmed = uri?.trim();
  if (!trimmed) return null;
  return fetchFromIpfs(trimmed, options);
}

/** Fetch both client and agent evidence from task. Skips empty URIs. */
export async function fetchTaskEvidence(
  task: Task,
  options?: { gateway?: string; asJson?: boolean }
): Promise<{ clientEvidence?: string | unknown; agentEvidence?: string | unknown }> {
  const result: { clientEvidence?: string | unknown; agentEvidence?: string | unknown } = {};
  if (task.clientEvidenceURI?.trim()) {
    result.clientEvidence = await fetchFromIpfs(task.clientEvidenceURI, options);
  }
  if (task.agentEvidenceURI?.trim()) {
    result.agentEvidence = await fetchFromIpfs(task.agentEvidenceURI, options);
  }
  return result;
}

/** Mock CID from content hash - same content = same URI, no network calls */
function mockCid(content: string | Uint8Array): string {
  const bytes =
    typeof content === "string" ? toUtf8Bytes(content) : content;
  const hash = keccak256(bytes).slice(2);
  return `mock${hash.slice(0, 20)}`;
}

/** Upload JSON to IPFS and return URI */
export async function uploadJson(
  data: unknown,
  config: IpfsConfig
): Promise<string> {
  const cid = await pinJson(data, config);
  const scheme = config.uriScheme ?? DEFAULT_IPFS_URI_SCHEME;
  return scheme === "https"
    ? `https://ipfs.io/ipfs/${cid}`
    : `ipfs://${cid}`;
}

/** Upload raw bytes/Blob to IPFS and return URI */
export async function uploadFile(
  content: Blob | Uint8Array,
  config: IpfsConfig
): Promise<string> {
  const cid = await pinFile(content, config);
  const scheme = config.uriScheme ?? DEFAULT_IPFS_URI_SCHEME;
  return scheme === "https"
    ? `https://ipfs.io/ipfs/${cid}`
    : `ipfs://${cid}`;
}

async function pinJson(data: unknown, config: IpfsConfig): Promise<string> {
  if (config.provider === "mock") {
    return mockCid(JSON.stringify(data));
  }
  if (config.provider === "pinata") {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinata pinJSON failed: ${res.status} ${err}`);
    }
    const json = (await res.json()) as { IpfsHash: string };
    return json.IpfsHash;
  }

  if (config.provider === "nft.storage") {
    const blob = new Blob([JSON.stringify(data)], {
      type: "application/json",
    });
    const res = await fetch("https://api.nft.storage/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`NFT.Storage upload failed: ${res.status} ${err}`);
    }
    const json = (await res.json()) as { value: { cid: string } };
    return json.value.cid;
  }

  throw new Error(`Unknown IPFS provider: ${config.provider}`);
}

async function pinFile(
  content: Blob | Uint8Array,
  config: IpfsConfig
): Promise<string> {
  const blob = content instanceof Blob ? content : new Blob([content as any]);

  if (config.provider === "mock") {
    const buf =
      content instanceof Uint8Array
        ? content
        : new Uint8Array(await blob.arrayBuffer());
    return mockCid(buf);
  }
  if (config.provider === "pinata") {
    const form = new FormData();
    form.append("file", blob);
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinata pinFile failed: ${res.status} ${err}`);
    }
    const json = (await res.json()) as { IpfsHash: string };
    return json.IpfsHash;
  }

  if (config.provider === "nft.storage") {
    const res = await fetch("https://api.nft.storage/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`NFT.Storage upload failed: ${res.status} ${err}`);
    }
    const json = (await res.json()) as { value: { cid: string } };
    return json.value.cid;
  }

  throw new Error(`Unknown IPFS provider: ${config.provider}`);
}
