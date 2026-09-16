import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { costUsd } from "./pricing";
import type { VoiceLogExtractionUsage } from "./extract-core";

/**
 * HMAC-hashes the caller's IP (never store/compare raw IPs) so the budget
 * limiter can key spend per-network without keeping PII around.
 */
export async function getClientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || headerList.get("x-real-ip")?.trim() || "unknown";

  const salt = process.env.AI_LIMIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!salt) {
    throw new Error("Missing AI_LIMIT_SALT (or SUPABASE_SERVICE_ROLE_KEY) environment variable.");
  }
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export type AiBudgetCheck =
  | { allowed: true }
  | { allowed: false; message: string; retryAfterSeconds: number };

type AiBudgetCheckRpcResult = {
  allowed: boolean;
  reason: "ip_hourly" | "global_monthly" | null;
  retry_after_seconds: number | null;
};

/** Calls the `ai_budget_check` RPC. Fails closed: any error denies the request. */
export async function checkAiBudget(ipHash: string): Promise<AiBudgetCheck> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("ai_budget_check", { p_ip_hash: ipHash });
    if (error || !data) {
      console.error("checkAiBudget: ai_budget_check RPC failed", error);
      return { allowed: false, message: "AI temporarily unavailable. Please try again shortly.", retryAfterSeconds: 60 };
    }

    const result = data as unknown as AiBudgetCheckRpcResult;
    if (result.allowed) return { allowed: true };

    const retryAfterSeconds = result.retry_after_seconds ?? 60;
    const message =
      result.reason === "global_monthly"
        ? `This month's AI budget has been used up. Try again ${formatRetry(retryAfterSeconds)}.`
        : `You've hit the hourly AI limit for this network. Try again ${formatRetry(retryAfterSeconds)}.`;
    return { allowed: false, message, retryAfterSeconds };
  } catch (error) {
    console.error("checkAiBudget: unexpected error", error);
    return { allowed: false, message: "AI temporarily unavailable. Please try again shortly.", retryAfterSeconds: 60 };
  }
}

/** Calls the `ai_usage_record` RPC. Logs but never throws on failure. */
export async function recordAiUsage(input: {
  ipHash: string;
  userId: string | null;
  usage: VoiceLogExtractionUsage;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("ai_usage_record", {
      p_ip_hash: input.ipHash,
      // `p_user_id uuid` is nullable in the DB (see the migration), but
      // `supabase gen types` can't see Postgres function-parameter
      // nullability, so it types this arg as `string` — hence the cast.
      p_user_id: input.userId as unknown as string,
      p_feature: "voice_log",
      p_model: input.usage.model,
      p_input: input.usage.input_tokens,
      p_output: input.usage.output_tokens,
      p_cache_read: input.usage.cache_read_input_tokens ?? 0,
      p_cache_write: input.usage.cache_creation_input_tokens ?? 0,
      p_cost: costUsd(input.usage),
    });
    if (error) {
      console.error("recordAiUsage: ai_usage_record RPC failed", error);
    }
  } catch (error) {
    console.error("recordAiUsage: unexpected error", error);
  }
}

export function formatRetry(seconds: number): string {
  if (seconds <= 0) return "in a moment";
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return "next month";
}
