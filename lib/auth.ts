import { cache } from "react";
import { redirect } from "next/navigation";
import { isAuthApiError, isAuthSessionMissingError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { memberAge } from "@/lib/age-policy";
import { log, serializeError } from "@/lib/observability/log";

export const AUTH_UNAVAILABLE_MESSAGE = "We couldn't check your sign-in just now. Please try again in a moment.";

/**
 * The caller's user for an API route, keeping "no session" apart from "the
 * auth service did not answer". A failed getUser() used to read as signed
 * out, so a GoTrue blip told signed-in people to sign in (401) -- under load
 * that was most of /api/spots/deal's errors. Signed out means no session, or
 * GoTrue rejected the token (a 4xx). Anything else (network, 5xx, a non-JSON
 * reply) is "unavailable": answer 503. Anonymous users come back as-is; each
 * route decides whether it accepts them.
 */
export async function sessionUser(supabase: SupabaseClient): Promise<User | "signed-out" | "unavailable"> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user;
  if (!error || isAuthSessionMissingError(error) || (isAuthApiError(error) && error.status < 500)) return "signed-out";
  log("error", "auth.unavailable", { error: serializeError(error) });
  return "unavailable";
}

// An auth outage throws to the page's error boundary (retry) instead of
// reading as signed out, which redirected members to /login mid-outage.
export const getCurrentUser = cache(async () => {
  const user = await sessionUser(await createClient());
  if (user === "unavailable") throw new Error("auth unavailable");
  return user === "signed-out" || user.is_anonymous ? null : user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Guard a post-auth redirect target. Only an internal path is safe — a
 * protocol-relative `//host` or absolute URL would send a signed-in session
 * off-site. Anything else falls back to `/home`, the default landing.
 *
 * Shared by `/auth/callback` (the OAuth/magic-link round trip) and the OTP
 * sign-in path in `app/auth/actions.ts`, so there is exactly one copy of this
 * check rather than one per call site.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith("/")) return "/home";
  // Backslashes and control characters are refused outright: browsers treat
  // "\\" as "/", and the URL parser strips tab/CR/LF, so "/\t/evil.com" would
  // otherwise become "//evil.com". Then the parsed result must stay on our origin,
  // and so must its path: the parser collapses dot segments, so "/.//evil.com"
  // (or "/%2e%2e//evil.com") stays on origin but comes out as "//evil.com",
  // which a browser reads as another host.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return "/home";
  const base = "https://internal.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return "/home"; // e.g. "//[": the parser throws on a malformed host
  }
  return url.origin === base && !url.pathname.startsWith("//")
    ? `${url.pathname}${url.search}${url.hash}`
    : "/home";
}

/**
 * Where a fresh sign-in lands. Everyone joining a plan now has an account
 * (owner decision 2026-09-25), and an account needs a date of birth, so a
 * first-time member detours through /onboarding with `next` carried along;
 * everyone else goes straight to `next`. A failed age read also detours:
 * /onboarding re-checks and forwards on, so the worst case is one extra hop.
 */
export async function landingAfterSignIn(supabase: SupabaseClient, userId: string, next: string): Promise<string> {
  if (await memberAge(supabase, userId) !== null) return next;
  return `/onboarding?next=${encodeURIComponent(next)}`;
}
