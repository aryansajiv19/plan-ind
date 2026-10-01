import { guard, reply } from "@/lib/gathering-api";
import { isUuid, parseHostSettings, toGroupPref } from "@/lib/gathering";
import { dealForGroup } from "@/lib/group-prefs";
import { MIN_ACCOUNT_AGE, memberAge } from "@/lib/age-policy";
import { curatedDealPool } from "@/lib/spots/catalogue";
import { photoCheck } from "@/lib/spots/deal-spots";
import type { DealConstraints, DealRatingRow } from "@/lib/spots/match";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { PlanPreferences } from "@/lib/types";

export const runtime = "nodejs";

const TOO_FEW_GROUP = "Not enough places fit everyone. Ask for a wider budget or a longer trip, or deal with your own settings.";
const TOO_FEW_HOST = "Not enough places match those settings. Widen the budget or the distance.";

// Host only: turn the group's answers (or, with {skip:true}, the host's own
// settings) into the nine places. The seed is the plan id, so a retry deals
// the same nine; start_group_plan is the one writer and refuses a second deal.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await guard(request, "plan-command", "Sign in to deal.");
  if (gate instanceof Response) return gate;
  const { supabase, user, body } = gate;
  if (!isUuid(id)) return reply(400, "That link is not a plan.");
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const skip = raw.skip === true;
  const host = parseHostSettings(raw);
  if ("error" in host) return reply(400, host.error);

  // The creator column is not readable by clients (051): the host check is am_plan_host (067).
  // start_group_plan re-checks it, so this is the early, friendly refusal.
  const [{ data: plan, error: planError }, { data: isHost, error: hostError }] = await Promise.all([
    supabase.from("plans").select("category, stage").eq("id", id).maybeSingle(),
    supabase.rpc("am_plan_host", { p_plan_id: id }),
  ]);
  if (planError || hostError) return reply(503, "Couldn't read the plan. Try again in a moment.");
  if (!plan) return reply(404, "That plan was not found.");
  if (isHost !== true) return reply(403, "Only the host can deal.");
  if (plan.stage !== "gathering") return reply(409, "Already dealt");

  const { data: rows, error: prefsError } = await supabase.from("plan_preferences").select("*").eq("plan_id", id);
  if (prefsError || !rows) return reply(503, "Couldn't read the group's answers. Try again in a moment.");

  // Age is the account's, never the body's; the pool is the shared curated cache.
  const age = (await memberAge(supabase, user.id)) ?? MIN_ACCOUNT_AGE;
  const pool = await curatedDealPool(plan.category);
  if (!pool) return reply(503, "Couldn't load places right now. Try again in a moment.");
  // A short ratings read must not quietly reorder the deal (see dealSpotIds): fail instead.
  const ratings: DealRatingRow[] = [];
  const ids = pool.filter((spot) => (spot.minimum_age ?? 0) <= age).map((spot) => spot.id);
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const page = await fetchAllRows<DealRatingRow>(
      (from, to) => supabase.from("ratings").select("spot_id,stars,again")
        .in("spot_id", slice).order("spot_id").range(from, to) as unknown as PromiseLike<{ data: DealRatingRow[] | null; error: unknown }>,
      "gatheringDeal.ratings",
    );
    if (!page) return reply(503, "Couldn't load places right now. Try again in a moment.");
    ratings.push(...page);
  }

  const hostConstraints: DealConstraints = { maxBudget: host.budgetCap, origin: host.origin, radiusKm: host.radiusKm };
  const dealt = dealForGroup({
    pool, prefs: skip ? [] : (rows as PlanPreferences[]).map(toGroupPref), category: plan.category,
    seed: id, age, ratings, hostConstraints,
  });
  if ("tooFew" in dealt) return reply(422, skip ? TOO_FEW_HOST : TOO_FEW_GROUP);

  const photos = await photoCheck(supabase, dealt.ids);
  if (photos === "unavailable") return reply(503, "Couldn't check those places. Try again in a moment.");
  if (photos === "photoless") return reply(422, "One of those places can't be dealt any more. Try again.");

  // Under two answers the deal ran on the host's own settings, so those are what it used.
  const { summary, radiusKm } = dealt;
  const budgetCap = summary.budgetCap ?? host.budgetCap;
  const centroid = summary.centroid ?? host.origin;
  const group = {
    ...(budgetCap != null ? { budgetCap } : {}),
    ...(centroid ? { centroid } : {}),
    ...(radiusKm != null ? { radiusKm } : {}),
    relaxed: summary.relaxed,
  };
  const { data, error } = await supabase.rpc("start_group_plan", { p_plan_id: id, p_spot_ids: dealt.ids, p_group: group });
  if (error) {
    console.error("Group deal failed", JSON.stringify({ planId: id, code: error.code }));
    if (error.code === "42501") return reply(403, "Only the host can deal.");
    if (error.code === "22023") return reply(422, "Those places were not accepted. Try again.");
    return reply(503, "Couldn't deal the places. Try again in a moment.");
  }
  const result = (data as { result?: unknown } | null)?.result;
  if (result === "dealt") return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  if (result === "not_gathering") return reply(409, "Already dealt");
  return reply(503, "Couldn't deal the places. Try again in a moment.");
}
