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

// Three states, never a boolean: a boolean invites the caller to read every
// failure as "too many". `limited` is the only state that is the user's doing
// (the RPC returned false because a counter passed its cap). `unavailable` is
// an RPC error: a wrong/missing control secret, a missing function, a
// network failure, or no session. Callers fail closed on it, but must not
// tell the user they did too much.
export type ControlResult = "allowed" | "limited" | "unavailable";

function controlResult(data: unknown, error: { code?: string } | null, scope: string): ControlResult {
  if (error) {
    if (process.env.NODE_ENV !== "production" && error.code === "PGRST202") return "allowed";
    console.error("Security control failed", JSON.stringify({ scope, code: error.code }));
    return "unavailable";
  }
  return data === true ? "allowed" : "limited";
}

export const CONTROL_UNAVAILABLE_MESSAGE = "This is temporarily unavailable. Please try again shortly.";

// Call once the caller has established the request is otherwise legitimate
// (after its auth check). consume_app_quota also raises when there is no
// session, so logging this inside the helper would page on every anonymous
// request that races the auth check.
export function reportControlUnavailable(scope: string): void {
  console.error(
    `SECURITY CONTROL MISCONFIGURED: ${scope} -- check SECURITY_CONTROL_SECRET matches app_control_secrets and the control RPCs are deployed`,
  );
}

export async function consumeQuota(
  supabase: SupabaseClient,
  scope: "smart-search" | "plan-create" | "place-import" | "spot-deal" | "plan-command" | "place-photo",
): Promise<ControlResult> {
  const { data, error } = await supabase.rpc("consume_app_quota", {
    p_secret: controlSecret(),
    p_scope: scope,
  });
  return controlResult(data, error, scope);
}

// Migration 026. Neither OTP step has a session yet, so neither can use
// consumeQuota (consume_app_quota requires auth.uid()). Keyed on the HMAC'd
// email — never the raw address — via the same private key as
// recordSecurityEvent's subject_hash.
async function consumeOtpLimit(
  supabase: SupabaseClient,
  scope: "otp-request" | "otp-verify",
  email: string,
): Promise<ControlResult> {
  const { data, error } = await supabase.rpc("consume_otp_limit", {
    p_secret: controlSecret(),
    p_scope: scope,
    p_subject: privateSubject(email),
  });
  return controlResult(data, error, scope);
}

export function consumeOtpRequestLimit(supabase: SupabaseClient, email: string): Promise<ControlResult> {
  return consumeOtpLimit(supabase, "otp-request", email);
}

// GoTrue's own rate limit on token verification is per-IP, not per-code
// attempt, so it's bypassed by spreading guesses across a few IPs. This is
// keyed on the target email instead, which a guesser can't route around.
export function consumeOtpVerifyLimit(supabase: SupabaseClient, email: string): Promise<ControlResult> {
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
