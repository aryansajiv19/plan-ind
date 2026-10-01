import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestJoinResult, GuestMergeResult } from "@/lib/types";

// Guest voting (migration 099, docs/GUEST_VOTE.md). The orchestration of
// POST /api/guest/join, with every side effect injected so it runs in a unit
// test. The route wires the real Supabase client and the control RPCs in.

export type GuestSession = "none" | "unavailable" | { anonymous: boolean };
export type Limit = "allowed" | "limited" | "unavailable";

export interface GuestJoinDeps {
  session(): Promise<GuestSession>;
  signOut(): Promise<void>;
  /** Mint an anonymous session. Supabase Auth verifies the Turnstile token. */
  signInAnonymously(captchaToken: string | undefined): Promise<"ok" | "captcha" | "limited" | "unavailable">;
  consumeLimit(): Promise<Limit>;
  join(planId: string, name: string): Promise<{ result: GuestJoinResult } | { error: "unavailable" | "no-plan" | "forbidden" }>;
}

export interface GuestJoinReply {
  status: number;
  body: { ok: true; status: "joined" | "already"; name: string } | { ok: false; error: string; needsAccount?: boolean };
}

const REFUSALS: Record<string, { status: number; error: string; needsAccount?: boolean }> = {
  full: { status: 409, error: "This plan has reached its guest limit. Sign in to join.", needsAccount: true },
  age_gated: { status: 403, error: "This plan has places with an age limit. Sign in to join.", needsAccount: true },
  removed: { status: 403, error: "The host removed you from this plan." },
  merged: { status: 409, error: "You have signed in. Open the plan with your account.", needsAccount: true },
  expired: { status: 409, error: "Your guest pass has expired. Sign in to keep voting.", needsAccount: true },
};

const unavailable: GuestJoinReply = { status: 503, body: { ok: false, error: "This is temporarily unavailable. Please try again shortly." } };

export async function guestJoin(
  input: { planId: string; name: string; captchaToken?: string; production: boolean },
  deps: GuestJoinDeps,
): Promise<GuestJoinReply> {
  const session = await deps.session();
  if (session === "unavailable") return unavailable;
  if (session !== "none" && !session.anonymous) {
    // An account joins with claim_plan_access, never as a guest.
    return { status: 409, body: { ok: false, error: "You are signed in. Open the plan with your account.", needsAccount: true } };
  }

  // Every attempt counts, an existing session's too: anonymous sessions can
  // also be minted straight at Supabase Auth, which this limit does not see.
  const limit = await deps.consumeLimit();
  if (limit === "unavailable") return unavailable;
  if (limit === "limited") return { status: 429, body: { ok: false, error: "Too many guests from this connection. Try again in a few minutes." } };

  // An existing guest re-enters without a new session (and without a new
  // Turnstile token): the RPC answers `already` for the same plan.
  if (session !== "none") {
    const again = await deps.join(input.planId, input.name);
    if ("error" in again) return again.error === "no-plan" ? noPlan : unavailable;
    const status = again.result.status;
    if (status === "joined" || status === "already") return accepted(again.result, input.name);
    if (status !== "other_plan" && status !== "expired") return reply(status);
    // bound to another plan, or expired: that session is done and a fresh one needs a fresh check
    await deps.signOut();
  }
  if (input.production && !input.captchaToken) {
    return { status: 400, body: { ok: false, error: "Complete the security check and try again." } };
  }

  const signedIn = await deps.signInAnonymously(input.captchaToken);
  if (signedIn === "captcha") return { status: 400, body: { ok: false, error: "The security check failed. Try again." } };
  if (signedIn === "limited") return { status: 429, body: { ok: false, error: "Too many guests from this connection. Try again in a few minutes." } };
  if (signedIn !== "ok") return unavailable;

  const joined = await deps.join(input.planId, input.name);
  if ("result" in joined && (joined.result.status === "joined" || joined.result.status === "already")) {
    return accepted(joined.result, input.name);
  }
  // Refused: do not leave a plan-less anonymous session behind in the cookie.
  await deps.signOut();
  if ("error" in joined) return joined.error === "no-plan" ? noPlan : unavailable;
  return reply(joined.result.status);
}

const noPlan: GuestJoinReply = { status: 404, body: { ok: false, error: "That plan link does not work." } };

function accepted(r: GuestJoinResult, fallbackName: string): GuestJoinReply {
  return { status: 200, body: { ok: true, status: r.status as "joined" | "already", name: r.name ?? fallbackName } };
}

function reply(status: string): GuestJoinReply {
  const r = REFUSALS[status] ?? { status: 409, error: "You cannot join this plan as a guest. Sign in to join.", needsAccount: true };
  return { status: r.status, body: { ok: false, error: r.error, ...(r.needsAccount ? { needsAccount: true } : {}) } };
}

// ── Upgrade ────────────────────────────────────────────────────────────────
// Browser side, no server route: both RPCs are granted to signed-in sessions
// and carry no secret. Call issueGuestMergeToken() before sending a guest to
// sign in (keep the token in localStorage), mergeGuestVotes() once signed in.

export async function issueGuestMergeToken(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("issue_guest_merge_token");
  return error || typeof data !== "string" ? null : data;
}

/** null = the call failed or the token was refused; the guest's votes stay on the plan. */
export async function mergeGuestVotes(supabase: SupabaseClient, token: string): Promise<GuestMergeResult | null> {
  const { data, error } = await supabase.rpc("merge_guest_into_me", { p_token: token });
  return error || !data ? null : (data as GuestMergeResult);
}
