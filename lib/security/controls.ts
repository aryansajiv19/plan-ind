import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// The Vercel-assigned id for the current request, for correlating a
// security_events row back to a specific request/log line. null off Vercel
// (local dev) — record_security_event already treats a null request id as
// "not available", it doesn't require one.
export async function requestId(): Promise<string | null> {
  return (await headers()).get("x-vercel-id");
}

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

// Migration 026. Neither OTP step has a session yet, so neither can use
// consumeQuota (consume_app_quota requires auth.uid()). Keyed on the HMAC'd
// email — never the raw address — via the same private key as
// recordSecurityEvent's subject_hash.
async function consumeOtpLimit(
  supabase: SupabaseClient,
  scope: "otp-request" | "otp-verify",
  email: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_otp_limit", {
    p_secret: controlSecret(),
    p_scope: scope,
    p_subject: privateSubject(email),
  });
  if (error) {
    if (process.env.NODE_ENV !== "production" && error.code === "PGRST202") return true;
    console.error("OTP rate limit control failed", JSON.stringify({ scope, code: error.code }));
    return false;
  }
  return data === true;
}

export function consumeOtpRequestLimit(supabase: SupabaseClient, email: string): Promise<boolean> {
  return consumeOtpLimit(supabase, "otp-request", email);
}

// GoTrue's own rate limit on token verification is per-IP, not per-code
// attempt, so it's bypassed by spreading guesses across a few IPs. This is
// keyed on the target email instead, which a guesser can't route around.
export function consumeOtpVerifyLimit(supabase: SupabaseClient, email: string): Promise<boolean> {
  return consumeOtpLimit(supabase, "otp-verify", email);
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
