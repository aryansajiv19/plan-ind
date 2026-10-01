import { guard, reply } from "@/lib/gathering-api";
import { plainText } from "@/lib/security/request";

export const runtime = "nodejs";

// Start a plan with no places: the group answers first, the host deals after.
export async function POST(request: Request) {
  const gate = await guard(request, "plan-create", "Sign in to start a plan.");
  if (gate instanceof Response) return gate;
  const { supabase, body } = gate;
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const title = plainText(raw.title, 60);
  const category = plainText(raw.category, 40);
  if (!title || !category) return reply(400, "A plan needs a title and a kind of night.");

  const { data, error } = await supabase.rpc("create_gathering_plan", { p_plan: { title, category } });
  if (error || !data || typeof data !== "object") {
    console.error("Gathering plan creation failed", JSON.stringify({ code: error?.code }));
    // PC429: the database's own daily cap (087); 42501: age or account rules.
    if (error?.code === "PC429") return reply(429, "Too many plans started. Try again later.");
    if (error?.code === "42501") return reply(403, "This account cannot start that plan.");
    if (error?.code === "22023") return reply(400, "The plan details were not accepted.");
    return reply(503, "Couldn't start the plan. Try again in a moment.");
  }
  const result = data as { id?: unknown; hostToken?: unknown };
  if (typeof result.id !== "string" || typeof result.hostToken !== "string") return reply(503, "Couldn't start the plan. Try again in a moment.");
  return Response.json({ id: result.id, hostToken: result.hostToken }, { headers: { "Cache-Control": "no-store" } });
}
