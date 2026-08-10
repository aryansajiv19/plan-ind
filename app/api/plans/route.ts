import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { memberAge, minimumAgeForCategory, prohibitedVenueReason } from "@/lib/age-policy";

export const runtime = "nodejs";

const requests = new Map<string, { count: number; resetsAt: number }>();

function allowed(identifier: string): boolean {
  const now = Date.now();
  const current = requests.get(identifier);
  if (!current || current.resetsAt <= now) {
    requests.set(identifier, { count: 1, resetsAt: now + 60_000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

function safeIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to start a plan." }, { status: 401 });
  if (!allowed(safeIdentifier(user.id))) return Response.json({ error: "Too many plans started. Try again in a minute." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid plan." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Send a valid plan." }, { status: 400 });
  const raw = body as Record<string, unknown>;
  const title = text(raw.title, 60);
  const category = text(raw.category, 40);
  const spotIds = Array.isArray(raw.spotIds) ? raw.spotIds.filter((id): id is string => typeof id === "string") : [];
  if (!title || !category || spotIds.length !== 9 || new Set(spotIds).size !== 9) {
    return Response.json({ error: "A plan needs a title, category, and nine different places." }, { status: 400 });
  }
  const age = await memberAge(supabase, user.id);
  if (age === null) return Response.json({ error: "Complete your age details before starting a plan." }, { status: 403 });
  if (age < minimumAgeForCategory(category)) return Response.json({ error: "That category has an age requirement that does not match this account." }, { status: 403 });

  const { data: spots, error: spotsError } = await supabase
    .from("spots")
    .select("id,source,created_by_user_id,name,category,cuisine,vibe,description,minimum_age")
    .in("id", spotIds);
  if (spotsError || !spots || spots.length !== spotIds.length) return Response.json({ error: "One or more places are no longer available." }, { status: 400 });
  const invalid = spots.find((spot) => {
    const ownerOk = spot.source === "curated" || spot.created_by_user_id === user.id;
    const ageOk = age >= Math.max(minimumAgeForCategory(spot.category), Number(spot.minimum_age ?? 0));
    return !ownerOk || !ageOk || Boolean(prohibitedVenueReason(spot.name, spot.cuisine, spot.vibe, spot.description));
  });
  if (invalid) return Response.json({ error: "One of those places does not meet the account's recommendation policy." }, { status: 403 });

  const deadline = text(raw.deadline, 40);
  if (!deadline || Number.isNaN(Date.parse(deadline))) return Response.json({ error: "Choose a valid voting deadline." }, { status: 400 });
  const hostToken = randomBytes(32).toString("hex");
  const hostTokenHash = createHash("sha256").update(hostToken).digest("hex");
  const { data: plan, error: planError } = await supabase.from("plans").insert({
    title, category, area: text(raw.area, 80) || null, deadline,
    status: "open", stage: "pool", pool_count: 3,
    budget_per_person: typeof raw.budgetPerPerson === "number" ? Math.max(0, Math.min(10_000, Math.round(raw.budgetPerPerson))) : null,
    origin_label: text(raw.originLabel, 80) || null,
    origin_latitude: typeof raw.originLatitude === "number" ? raw.originLatitude : null,
    origin_longitude: typeof raw.originLongitude === "number" ? raw.originLongitude : null,
    radius_km: typeof raw.radiusKm === "number" ? Math.max(1, Math.min(500, Math.round(raw.radiusKm))) : null,
    smart_brief: text(raw.smartBrief, 600) || null,
    vibe_preferences: Array.isArray(raw.vibePreferences) ? raw.vibePreferences.filter((v): v is string => typeof v === "string").slice(0, 6) : [],
    avoid_preferences: Array.isArray(raw.avoidPreferences) ? raw.avoidPreferences.filter((v): v is string => typeof v === "string").slice(0, 5) : [],
    intelligence_model: text(raw.intelligenceModel, 80) || null,
    created_by_user_id: user.id,
  }).select("id").single();
  if (planError || !plan) return Response.json({ error: "Couldn't start the plan. Try again in a moment." }, { status: 500 });

  // A plan without its host token or its places is unusable, so roll the plan
  // row back rather than leaving a permanently broken share link behind.
  // ponytail: cleanup-on-failure, not atomic — an RPC if partial writes ever matter.
  const abort = async (error: string) => {
    await supabase.from("plans").delete().eq("id", plan.id);
    return Response.json({ error }, { status: 500 });
  };

  const { error: tokenError } = await supabase
    .from("plan_host_tokens")
    .insert({ plan_id: plan.id, token_hash: hostTokenHash });
  if (tokenError) return abort("Couldn't start the plan. Try again in a moment.");

  const { error: linksError } = await supabase.from("plan_spots").insert(spotIds.map((spot_id, index) => ({ plan_id: plan.id, spot_id, pool_number: (index % 3) + 1, advanced: false })));
  if (linksError) return abort("Couldn't attach the places to that plan. Try again in a moment.");
  return Response.json({ id: plan.id, hostToken }, { headers: { "Cache-Control": "no-store" } });
}
