import { createClient } from "@/lib/supabase/server";
import { MIN_ACCOUNT_AGE } from "@/lib/age-policy";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { plainText } from "@/lib/security/request";
import { CONTROL_UNAVAILABLE_MESSAGE, consumeDealPreviewLimit, reportControlUnavailable } from "@/lib/security/controls";
import { curatedDealPool } from "@/lib/spots/catalogue";
import { dealFromPool, dubaiToday, isKnownCategory } from "@/lib/spots/match";

export const runtime = "nodejs";

const NINE = 9;

function bounded(value: string | null, maximum: number): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(maximum, n)) : null;
}

// P8: "Preview the deal" for a visitor who hasn't signed up -- nine real
// cards for the settings they picked, so choosing Padel under AED 100 no
// longer shows AED 550 dinners. Signed out on purpose, so:
//   - the age gate is the strictest (the youngest account age): no 18+/21+ place
//     is ever shown to someone whose age we don't know;
//   - it reads only the shared cached catalogue and writes nothing (no plan, no
//     ratings read -- the ranking uses none);
//   - it is limited per hashed client IP in Postgres (072), since there is no
//     account to key on.
// Fewer than nine matches is { cards: null, reason: "tooFew" }: the client
// falls back to its sample decks and says so.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const category = plainText(params.get("category"), 40);
  if (!category || !isKnownCategory(category)) {
    return Response.json({ error: "Pick a type of place." }, { status: 400 });
  }
  const origin = DUBAI_ORIGINS.find((o) => o.value === (params.get("origin") ?? "anywhere"));
  if (!origin) return Response.json({ error: "Pick a starting area." }, { status: 400 });

  const supabase = await createClient();
  const limit = await consumeDealPreviewLimit(supabase, request);
  if (limit === "unavailable") {
    reportControlUnavailable("deal-preview");
    return Response.json({ error: CONTROL_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  if (limit === "limited") {
    return Response.json({ error: "Too many previews. Try again in a minute." }, { status: 429 });
  }

  const pool = await curatedDealPool(category);
  if (!pool) return Response.json({ error: "Couldn't deal places right now. Try again in a moment." }, { status: 503 });

  const constraints = {
    age: MIN_ACCOUNT_AGE,
    maxBudget: bounded(params.get("maxBudget"), 10_000),
    origin: origin.coordinates,
    radiusKm: origin.coordinates ? bounded(params.get("radiusKm"), 100) : null,
  };
  const today = dubaiToday();
  const noStore = { headers: { "Cache-Control": "no-store" } };
  const ids = dealFromPool({ category, count: NINE, pool, ratings: [], constraints, today });
  if (!ids) return Response.json({ cards: null, reason: "tooFew" }, noStore);
  const byId = new Map(pool.map((spot) => [spot.id, spot]));
  const cards = ids.map((id) => {
    const spot = byId.get(id)!;
    return { id: spot.id, name: spot.name, area: spot.area, category: spot.category };
  });
  return Response.json({ cards }, noStore);
}
