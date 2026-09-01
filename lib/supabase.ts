import { createClient } from "./supabase/client";

// Shared browser client. @supabase/ssr stores the authenticated session in
// cookies so Server Components, Actions, Route Handlers, and browser queries
// all observe the same user.
export const supabase = createClient();

/**
 * Why a share link needs a session at all.
 *
 * Migration 020 moved every read on plans, plan_spots, votes, rsvps, ratings
 * and spots behind the `plan_access` capability table, granted `to
 * authenticated`. The uuid in /plan/:id is still the capability, but a browser
 * must now redeem it: get a session, then call `claim_plan_access`, which
 * inserts the (plan_id, user_id) membership row every one of those policies
 * checks. Reading before the claim returns an empty set that is
 * indistinguishable from a deleted plan.
 *
 * For a guest that session comes from `signInAnonymously`, and **anonymous
 * sign-ins are currently disabled in this Supabase project** — a live probe of
 * POST /auth/v1/signup returns 422 `anonymous_provider_disabled` (2026-08-28).
 * That is an owner-only dashboard toggle; nothing in this repo can fix it. So
 * this returns that case as its own reason rather than folding it into a
 * generic failure: it is not the visitor's bad link, it is our configuration,
 * and the screen should be able to say so.
 */
export type PlanAccessDenial =
  /** Supabase Auth has anonymous sign-ins turned off. Owner toggle. Not the visitor's fault. */
  | "anonymous-disabled"
  /** Production needs a Turnstile token before it will mint a guest session. */
  | "captcha-required"
  /** Anonymous sign-in was attempted and failed for some other reason. */
  | "sign-in-failed"
  /** Session is fine; there is no plan with that id. */
  | "not-found"
  /** Session is fine; the claim itself failed. */
  | "claim-failed";

export type PlanAccessResult =
  | { ok: true }
  | { ok: false; reason: PlanAccessDenial };

/**
 * Redeem a share-link uuid into a readable plan membership.
 *
 * Returns a reason instead of throwing so the caller can tell "your link is
 * dead" from "our guest sessions are switched off". Do not collapse these back
 * into one error state, and do not fake success — every read after this point
 * depends on the membership row actually existing.
 */
export async function bootstrapPlanAccess(
  planId: string,
  captchaToken?: string,
): Promise<PlanAccessResult> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (process.env.NODE_ENV === "production" && !captchaToken) {
      return { ok: false, reason: "captcha-required" };
    }
    const { data, error } = await supabase.auth.signInAnonymously({
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) {
      // gotrue answers 422 with error_code `anonymous_provider_disabled`;
      // supabase-js surfaces it on AuthApiError.code. Older builds only set
      // the message, hence the second check.
      const disabled = error.code === "anonymous_provider_disabled"
        || /anonymous sign-?ins are disabled/i.test(error.message);
      return { ok: false, reason: disabled ? "anonymous-disabled" : "sign-in-failed" };
    }
    if (!data.user || !data.session) return { ok: false, reason: "sign-in-failed" };
    await supabase.realtime.setAuth(data.session.access_token);
  }

  const { data: claimed, error } = await supabase.rpc("claim_plan_access", { p_plan_id: planId });
  if (error) {
    // Migration 020 is additive. Keep local development usable while it is
    // being applied, but fail closed in production.
    if (process.env.NODE_ENV !== "production" && error.code === "PGRST202") return { ok: true };
    return { ok: false, reason: "claim-failed" };
  }
  // claim_plan_access returns false only when no plan has that id.
  return claimed ? { ok: true } : { ok: false, reason: "not-found" };
}
