import { createClient } from "@/lib/supabase/server";
import { consumeQuota, recordSecurityEvent } from "@/lib/security/controls";
import {
  plainText,
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";

export const runtime = "nodejs";

// Same as app/api/plans/route.ts's UUID -- 8-4-4-4-12 hex, no version/
// variant constraint, matching what Postgres's own `uuid` type accepts (the
// real curated catalog's ids are deterministic, not gen_random_uuid()).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// design-system/SPECS.md §10 / PRIORITIES.md "Direct plan": a second
// creation path for someone who already knows the place and wants to lock
// it in immediately -- create_secure_plan's sibling, not a mode flag on it
// (see migration-034's header for why they don't share a body). Same
// house-preamble shape as every mutating route in this app: origin/CSRF ->
// body cap -> auth -> quota -> validate -> RPC.
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
  // identical comment for why this is safe.
  const [{ data: { user } }, quotaOk] = await Promise.all([
    supabase.auth.getUser(),
    consumeQuota(supabase, "plan-create"),
  ]);
  if (!user || user.is_anonymous) {
    return Response.json({ error: "Sign in to start a plan." }, { status: 401 });
  }
  // Same cost/risk shape as the deal-and-vote path -- one bucket, not a new
  // scope, matches spot-deal-vs-plan-create's precedent for "own bucket
  // only when the usage pattern genuinely differs" (it doesn't here).
  if (!quotaOk) {
    await recordSecurityEvent(supabase, { type: "rate_limit", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { scope: "plan-create" } });
    return Response.json({ error: "Too many plans started. Try again later." }, { status: 429 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Send a valid plan." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const spotId = typeof raw.spotId === "string" && UUID.test(raw.spotId) ? raw.spotId : null;
  if (!plainText(raw.title, 60) || !spotId) {
    return Response.json({ error: "A plan needs a title and a place." }, { status: 400 });
  }

  // create_direct_plan derives category from the spot itself (see its own
  // header for why) and doesn't accept spotId/category/intelligenceModel in
  // p_plan -- strip all three rather than let the RPC's field whitelist
  // reject the request for carrying keys the client's shared form state
  // (the same object /api/plans/route.ts's StartPlanForm flow builds)
  // happens to still have.
  const planInput = { ...raw };
  delete planInput.spotId;
  delete planInput.category;
  delete planInput.intelligenceModel;
  const { data, error } = await supabase.rpc("create_direct_plan", {
    p_plan: planInput,
    p_spot_id: spotId,
  });
  if (error || !data || typeof data !== "object") {
    console.error("Direct plan creation failed", JSON.stringify({ code: error?.code }));
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
