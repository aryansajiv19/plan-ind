import { createClient } from "./supabase/client";

// Shared browser client. @supabase/ssr stores the authenticated session in
// cookies so Server Components, Actions, Route Handlers, and browser queries
// all observe the same user.
//
// ── Why this is a function, not `export const supabase = createClient()` ──
//
// It was the const. Constructing the client at MODULE LOAD meant importing
// this file -- or anything importing it, which includes lib/social.ts and
// therefore visits, friends, collections and photos -- threw without
// NEXT_PUBLIC_SUPABASE_* set. A unit test could not import the data layer at
// all without an env-then-dynamic-import dance.
//
// So a module-level side effect was quietly setting this codebase's
// testability boundary: place-import and spots-match are well covered
// because they import nothing that constructs a client, while the entire
// signed-in data layer had none. That looked like neglect and was actually
// structural -- and it mattered, because the bugs in that layer were failed
// reads collapsing into `[]`, precisely what a unit test catches and a hand
// sweep misses.
//
// Memoised, so callers still share one client and its identity stays stable
// across renders (hook dependency arrays depend on that).
// `createBrowserClient` is itself a browser singleton, so the memo mostly
// matters off-browser -- but it makes the laziness free either way.
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabase(): ReturnType<typeof createClient> {
  browserClient ??= createClient();
  return browserClient;
}

/**
 * Why a share link needs a session at all.
 *
 * Migration 020 moved every read on plans, plan_spots, votes, rsvps, ratings
 * and spots behind the `plan_access` capability table, granted `to
 * authenticated`. The uuid in /plan/:id is still the capability, but a browser
 * must redeem it: call `claim_plan_access`, which inserts the (plan_id,
 * user_id) membership row every one of those policies checks. Reading before
 * the claim returns an empty set indistinguishable from a deleted plan.
 *
 * The session must be a real account (owner decision 2026-09-25; migration
 * 064 refuses anonymous callers). proxy.ts already sends a signed-out visitor
 * to /login before the page renders, so "signed-out" here means the session
 * ended while the page was open, or a crawler-looking user agent got through.
 */
export type PlanAccessDenial =
  /** No account session. The screen offers sign-in and a way back. */
  | "signed-out"
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
 * dead" from "sign in first". Do not collapse these back into one error
 * state, and do not fake success — every read after this point depends on the
 * membership row actually existing.
 */
export async function claimPlanAccess(planId: string): Promise<PlanAccessResult> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return { ok: false, reason: "signed-out" };

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
