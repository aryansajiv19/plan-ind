import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

function controlSecret(): string {
  const secret = process.env.SECURITY_CONTROL_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SECURITY_CONTROL_SECRET is required in production.");
  }
  return secret ?? "development-only-control-secret";
}

export function privateSubject(value: string): string {
  return createHmac("sha256", controlSecret()).update(value).digest("hex");
}

export async function consumeQuota(
  supabase: SupabaseClient,
  scope: "smart-search" | "plan-create" | "place-import" | "spot-deal",
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_app_quota", {
    p_secret: controlSecret(),
    p_scope: scope,
  });
  if (error) {
    if (process.env.NODE_ENV !== "production" && error.code === "PGRST202") return true;
    console.error("Quota control failed", JSON.stringify({ scope, code: error.code }));
    return false;
  }
  return data === true;
}

export async function recordSecurityEvent(
  supabase: SupabaseClient,
  event: {
    type: "otp_request" | "otp_verify" | "captcha" | "authorization" | "rate_limit" | "plan_command" | "ai_quota";
    outcome: "success" | "failure" | "blocked";
    subject?: string;
    requestId?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  const { error } = await supabase.rpc("record_security_event", {
    p_secret: controlSecret(),
    p_event_type: event.type,
    p_outcome: event.outcome,
    p_subject_hash: event.subject ? privateSubject(event.subject) : null,
    p_request_id: event.requestId ?? null,
    p_metadata: event.metadata ?? {},
  });
  if (error && process.env.NODE_ENV === "production") {
    console.error("Security event persistence failed", JSON.stringify({
      type: event.type,
      code: error.code,
    }));
  }
}
