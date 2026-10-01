// The shared front of the gathering routes: the same CSRF, body, sign-in and
// quota gates /api/plans and /api/spots/deal run, in the same order, so each
// route reads as its own rules only.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AUTH_UNAVAILABLE_MESSAGE, sessionUser } from "@/lib/auth";
import { CONTROL_UNAVAILABLE_MESSAGE, consumeQuota, recordSecurityEvent, reportControlUnavailable } from "@/lib/security/controls";
import { readJsonBody, requestError, validateMutationRequest } from "@/lib/security/request";
import { GROUP_PREFS_UNAVAILABLE, isMissingGroupPrefs } from "@/lib/gathering";

let warned = false;
/**
 * A typed 503 when the group-preferences SQL (migration 100) is not there yet,
 * else null. Logged once per server process, no stack: it is a state, not a bug.
 */
export function groupPrefsMissing(error: { code?: string } | null | undefined): Response | null {
  if (!error || !isMissingGroupPrefs(error.code)) return null;
  if (!warned) { warned = true; console.warn("Group preferences unavailable: migration 100 is not applied", JSON.stringify({ code: error.code })); }
  return Response.json({ error: "Asking the group is not available yet.", code: GROUP_PREFS_UNAVAILABLE }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

export const reply =(status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function guard(request: Request, scope: "plan-create" | "plan-command", signedInMessage: string):
  Promise<{ supabase: SupabaseClient; user: User; body: unknown } | Response> {
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 4_096);
  } catch (error) {
    return requestError(error, "The request could not be read.");
  }
  const supabase = await createClient();
  // Independent I/O, run together; still checked in the original order so a
  // signed-out caller sees 401, never a stray 429 (see /api/spots/deal).
  const [user, quota] = await Promise.all([sessionUser(supabase), consumeQuota(supabase, scope)]);
  if (user === "unavailable") return reply(503, AUTH_UNAVAILABLE_MESSAGE);
  if (user === "signed-out" || user.is_anonymous) return reply(401, signedInMessage);
  if (quota === "unavailable") {
    reportControlUnavailable(scope);
    return reply(503, CONTROL_UNAVAILABLE_MESSAGE);
  }
  if (quota === "limited") {
    await recordSecurityEvent(supabase, { type: "rate_limit", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { scope } });
    return reply(429, scope === "plan-create" ? "Too many plans started. Try again later." : "Too many changes. Try again in a minute.");
  }
  return { supabase, user, body };
}
