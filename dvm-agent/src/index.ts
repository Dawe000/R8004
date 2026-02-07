/**
 * UMA DVM Dispute Resolution Agent - Cloudflare Worker
 * Cron-triggered: fetches escalated disputes, Venice decides, pushResolution.
 */

import { DvmState } from "./DvmState";
import { resolvePendingDisputes } from "./disputeResolver";
import { PLASMA_TESTNET_DEFAULTS } from "@erc8001/agent-task-sdk";

export { DvmState };

export interface Env {
  DVM_STATE: DurableObjectNamespace<DvmState>;
  VENICE_API_KEY: string;
  DVM_PRIVATE_KEY: string;
  RPC_URL: string;
  ESCROW_ADDRESS?: string;
  MOCK_OOv3_ADDRESS?: string;
  DEPLOYMENT_BLOCK?: string;
  ENVIRONMENT?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...headers,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/") {
      return jsonResponse({
        status: "ok",
        service: "dvm-agent",
        env: env.ENVIRONMENT ?? "production",
      });
    }

    return jsonResponse({ error: "Not Found" }, 404);
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const stub = env.DVM_STATE.get(env.DVM_STATE.idFromName("dvm-state"));

    const dvmEnv = {
      VENICE_API_KEY: env.VENICE_API_KEY,
      DVM_PRIVATE_KEY: env.DVM_PRIVATE_KEY,
      RPC_URL: env.RPC_URL,
      ESCROW_ADDRESS: env.ESCROW_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.escrowAddress,
      MOCK_OOv3_ADDRESS: env.MOCK_OOv3_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.mockOOv3Address,
      DEPLOYMENT_BLOCK: env.DEPLOYMENT_BLOCK
        ? parseInt(env.DEPLOYMENT_BLOCK, 10)
        : Number(PLASMA_TESTNET_DEFAULTS.deploymentBlock),
    };

    ctx.waitUntil(
      (async () => {
        try {
          const results = await resolvePendingDisputes(dvmEnv, {
            isProcessed: (id) => stub.isProcessed(id),
            markProcessed: (id) => stub.markProcessed(id),
          });
          console.log(
            "DVM cron: processed",
            results.length,
            "disputes",
            results.filter((r) => r.resolved).length,
            "resolved"
          );
        } catch (err) {
          console.error("DVM cron failed:", err);
        }
      })()
    );
  },
};
