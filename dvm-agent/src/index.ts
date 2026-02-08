/**
 * UMA DVM Dispute Resolution Agent - Cloudflare Worker
 * Cron-triggered: fetches escalated disputes (Plasma + Flare), Venice decides, pushResolution.
 */

import { resolvePendingDisputes } from "./disputeResolver";
import type { DvmEnv } from "./disputeResolver";
import { createD1State } from "./db";
import {
  PLASMA_TESTNET_DEFAULTS,
  COSTON2_FIRELIGHT_DEFAULTS,
} from "@erc8001/agent-task-sdk";

export interface Env {
  DB: D1Database;
  VENICE_API_KEY: string;
  DVM_PRIVATE_KEY: string;
  /** Plasma testnet */
  RPC_URL: string;
  ESCROW_ADDRESS?: string;
  MOCK_OOv3_ADDRESS?: string;
  DEPLOYMENT_BLOCK?: string;
  /** Flare Coston2 – same resolution flow */
  FLARE_RPC_URL?: string;
  FLARE_ESCROW_ADDRESS?: string;
  FLARE_MOCK_OOv3_ADDRESS?: string;
  FLARE_DEPLOYMENT_BLOCK?: string;
  IPFS_GATEWAY?: string;
  /** When set, use Pinata gateway (better for content pinned via Pinata) */
  PINATA_JWT?: string;
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
    const dvmState = createD1State(env.DB);

    const shared = {
      VENICE_API_KEY: env.VENICE_API_KEY,
      DVM_PRIVATE_KEY: env.DVM_PRIVATE_KEY,
      IPFS_GATEWAY: env.IPFS_GATEWAY,
      PINATA_JWT: env.PINATA_JWT,
    };

    const plasma: DvmEnv = {
      ...shared,
      RPC_URL: env.RPC_URL,
      ESCROW_ADDRESS: env.ESCROW_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.escrowAddress,
      MOCK_OOv3_ADDRESS: env.MOCK_OOv3_ADDRESS ?? PLASMA_TESTNET_DEFAULTS.mockOOv3Address,
      DEPLOYMENT_BLOCK: env.DEPLOYMENT_BLOCK
        ? parseInt(env.DEPLOYMENT_BLOCK, 10)
        : Number(PLASMA_TESTNET_DEFAULTS.deploymentBlock),
    };

    const flare: DvmEnv = {
      ...shared,
      RPC_URL: env.FLARE_RPC_URL ?? COSTON2_FIRELIGHT_DEFAULTS.rpcUrl,
      ESCROW_ADDRESS: env.FLARE_ESCROW_ADDRESS ?? COSTON2_FIRELIGHT_DEFAULTS.escrowAddress,
      MOCK_OOv3_ADDRESS: env.FLARE_MOCK_OOv3_ADDRESS ?? COSTON2_FIRELIGHT_DEFAULTS.mockOOv3Address,
      DEPLOYMENT_BLOCK: env.FLARE_DEPLOYMENT_BLOCK
        ? parseInt(env.FLARE_DEPLOYMENT_BLOCK, 10)
        : Number(COSTON2_FIRELIGHT_DEFAULTS.deploymentBlock),
      MAX_LOG_BLOCK_RANGE: 30, // Flare Coston2 RPC limit
    };

    const deployments: DvmEnv[] = [plasma, flare];

    ctx.waitUntil(
      (async () => {
        let totalProcessed = 0;
        let totalResolved = 0;
        for (const dvmEnv of deployments) {
          try {
            const results = await resolvePendingDisputes(dvmEnv, dvmState);
            const resolved = results.filter((r) => r.resolved).length;
            totalProcessed += results.length;
            totalResolved += resolved;
            if (results.length > 0) {
              console.log(
                "DVM cron:",
                dvmEnv.ESCROW_ADDRESS.slice(0, 10) + "...",
                "processed",
                results.length,
                "disputes",
                resolved,
                "resolved"
              );
            }
          } catch (err) {
            console.error("DVM cron failed for", dvmEnv.ESCROW_ADDRESS.slice(0, 10) + "...", err);
          }
        }
        console.log("DVM cron: processed", totalProcessed, "disputes", totalResolved, "resolved");
      })()
    );
  },
};
