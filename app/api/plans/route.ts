import { createClient } from "@/lib/supabase/server";
import { consumeQuota, recordSecurityEvent } from "@/lib/security/controls";
import {
  plainText,
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";

export const runtime = "nodejs";

// 8-4-4-4-12 hex, no version/variant constraint -- matches what Postgres's
// own `uuid` column type actually accepts. A stricter v1-5/variant-8-9-a-b
// pattern here rejected every real curated spot id (they're deterministic,
// e.g. "a0000000-0000-0000-0000-000000000001", not gen_random_uuid()
// output), silently filtering spotIds to fewer than 9 and blocking every
// plan creation that used dealt/curated spots -- the primary path.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 16_384);
  } catch (error) {
    return requestError(error, "The plan request could not be read.");
  }

  const supabase = await createClient();
  // Independent I/O, run together -- see app/api/spots/deal/route.ts's
  // identical comment for why this is safe (the quota RPC fails closed on
  // its own session, doesn't need the user object below).
  const [{ data: { user } }, quotaOk] = await Promise.all([
    supabase.auth.getUser(),
    consumeQuota(supabase, "plan-create"),
  ]);
  if (!user || user.is_anonymous) {
    return Response.json({ error: "Sign in to start a plan." }, { status: 401 });
  }
  if (!quotaOk) {
    await recordSecurityEvent(supabase, { type: "rate_limit", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { scope: "plan-create" } });
    return Response.json({ error: "Too many plans started. Try again later." }, { status: 429 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Send a valid plan." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const spotIds = Array.isArray(raw.spotIds)
    ? raw.spotIds.filter((id): id is string => typeof id === "string" && UUID.test(id))
    : [];
  if (!plainText(raw.title, 60) || !plainText(raw.category, 40)
      || spotIds.length !== 9 || new Set(spotIds).size !== 9) {
    return Response.json({ error: "A plan needs a title, category, and nine different places." }, { status: 400 });
  }

  const planInput = { ...raw };
  delete planInput.spotIds;
  delete planInput.intelligenceModel;
  const { data, error } = await supabase.rpc("create_secure_plan", {
    p_plan: planInput,
    p_spot_ids: spotIds,
  });
  if (error || !data || typeof data !== "object") {
    console.error("Secure plan creation failed", JSON.stringify({ code: error?.code }));
    const status = error?.code === "42501" ? 403 : error?.code === "22023" ? 400 : 500;
    return Response.json({ error: status === 403
      ? "This account cannot create that plan."
      : status === 400
        ? "The plan details were not accepted."
        : "Couldn't start the plan. Try again in a moment." }, { status });
  }

  const result = data as { id?: unknown; hostToken?: unknown };
  if (typeof result.id !== "string" || typeof result.hostToken !== "string") {
    return Response.json({ error: "Couldn't start the plan. Try again in a moment." }, { status: 500 });
  }
  return Response.json({ id: result.id, hostToken: result.hostToken }, {
    headers: { "Cache-Control": "no-store" },
  });
}
