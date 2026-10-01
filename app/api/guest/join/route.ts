import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/auth";
import { consumeGuestLimit, joinPlanAsGuest, reportControlUnavailable } from "@/lib/security/controls";
import { plainText, readJsonBody, requestError, validateMutationRequest } from "@/lib/security/request";
import { guestJoin } from "@/lib/guest";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guest voting (migration 099, docs/GUEST_VOTE.md): bind an anonymous session
// to ONE plan. Body: { planId, name, captchaToken }. The Turnstile token goes
// to Supabase Auth, which verifies it when it mints the session.
export async function POST(request: Request) {
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 2_048);
  } catch (error) {
    return requestError(error, "The request could not be read.");
  }
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const planId = typeof raw.planId === "string" && UUID.test(raw.planId) ? raw.planId : "";
  const name = plainText(raw.name, 40);
  if (!planId || !name) return Response.json({ error: "Enter your first name." }, { status: 400 });
  const captchaToken = typeof raw.captchaToken === "string" && raw.captchaToken ? raw.captchaToken.slice(0, 2048) : undefined;

  const supabase = await createClient();
  const reply = await guestJoin(
    { planId, name, captchaToken, production: process.env.NODE_ENV === "production" },
    {
      async session() {
        const user = await sessionUser(supabase);
        if (user === "unavailable") return "unavailable";
        return user === "signed-out" ? "none" : { anonymous: user.is_anonymous === true };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async signInAnonymously(token) {
        const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken: token } });
        if (!error) return "ok";
        if (error.status === 429) return "limited";
        return error.status === 400 || error.status === 403 ? "captcha" : "unavailable";
      },
      async consumeLimit() {
        const limit = await consumeGuestLimit(supabase, request);
        if (limit === "unavailable") reportControlUnavailable("guest-join");
        return limit;
      },
      join: (id, guestName) => joinPlanAsGuest(supabase, id, guestName),
    },
  );
  return Response.json(reply.body, { status: reply.status, headers: { "Cache-Control": "no-store" } });
}
