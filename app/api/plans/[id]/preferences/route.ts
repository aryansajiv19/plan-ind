import { groupPrefsMissing, guard, reply } from "@/lib/gathering-api";
import { isUuid, parsePrefs } from "@/lib/gathering";

export const runtime = "nodejs";

// A member's three taps. The RPC takes the name from the profile and the
// coordinates from its own list; this route only refuses what is off-list.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await guard(request, "plan-command", "Sign in to answer.");
  if (gate instanceof Response) return gate;
  const { supabase, body } = gate;
  const prefs = parsePrefs(body);
  if ("error" in prefs || !isUuid(id)) return reply(400, "error" in prefs ? prefs.error : "That link is not a plan.");

  const { data, error } = await supabase.rpc("set_plan_preferences", {
    p_plan_id: id, p_budget_cap: prefs.budgetCap, p_origin_value: prefs.origin, p_vibes: prefs.vibes, p_avoid: prefs.avoid,
  });
  if (error) {
    const missing = groupPrefsMissing(error);
    if (missing) return missing;
    console.error("Preferences save failed", JSON.stringify({ planId: id, code: error.code }));
    if (error.code === "42501") return reply(403, "You are not on this plan.");
    if (error.code === "22023") return reply(400, "Those answers were not accepted.");
    return reply(503, "Couldn't save your answers. Try again in a moment.");
  }
  const result = (data as { result?: unknown } | null)?.result;
  if (result === "saved") return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  if (result === "not_gathering") return reply(409, "The group already has its places.");
  return reply(503, "Couldn't save your answers. Try again in a moment.");
}
