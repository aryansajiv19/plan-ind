import { createClient } from "@/lib/supabase/server";
import { AUTH_UNAVAILABLE_MESSAGE, sessionUser } from "@/lib/auth";
import { MIN_ACCOUNT_AGE, memberAge } from "@/lib/age-policy";
import { DUBAI_ORIGINS } from "@/lib/dubai-areas";
import { plainText } from "@/lib/security/request";
import { curatedDealPool } from "@/lib/spots/catalogue";
import {
  DEAL_BUDGET_OPTIONS,
  DEAL_CATEGORIES,
  DEAL_RADIUS_OPTIONS_KM,
  dubaiToday,
  eligibleCount,
  isKnownCategory,
} from "@/lib/spots/match";

export const runtime = "nodejs";

// P6: before the host submits, how many places each budget x radius choice
// could deal from, for THIS viewer's age -- so dead-end options can be labelled
// ("Up to AED 100 · 1 place") and categories that can never fill hidden.
// Reads only the shared cached catalogue (no per-user query beyond the age),
// writes nothing. Counts are of the category's whole family, which is what a
// deal draws from; "been" is a soft filter and doesn't reduce them.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const category = plainText(params.get("category"), 40);
  if (!category || !isKnownCategory(category)) {
    return Response.json({ error: "Pick a type of place." }, { status: 400 });
  }
  const originValue = params.get("origin") ?? "anywhere";
  const origin = DUBAI_ORIGINS.find((o) => o.value === originValue);
  if (!origin) return Response.json({ error: "Pick a starting area." }, { status: 400 });

  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (user === "unavailable") return Response.json({ error: AUTH_UNAVAILABLE_MESSAGE }, { status: 503 });
  if (user === "signed-out" || user.is_anonymous) {
    return Response.json({ error: "Sign in to plan." }, { status: 401 });
  }
  // The account's age, never a client's; missing fails closed to the youngest.
  const age = (await memberAge(supabase, user.id)) ?? MIN_ACCOUNT_AGE;

  const pool = await curatedDealPool(category);
  if (!pool) return Response.json({ error: "Couldn't count places right now. Try again in a moment." }, { status: 503 });
  const today = dubaiToday();

  const counts = DEAL_BUDGET_OPTIONS.map((maxBudget) => ({
    maxBudget,
    radii: DEAL_RADIUS_OPTIONS_KM.map((radiusKm) => ({
      radiusKm,
      count: eligibleCount(pool, {
        age, maxBudget, origin: origin.coordinates, radiusKm: origin.coordinates ? radiusKm : null,
      }, today),
    })),
  }));

  // The most each category could ever offer this viewer (any budget,
  // anywhere). null when that family's pool couldn't be read -- unknown, not 0.
  const categories: Record<string, number | null> = {};
  for (const other of DEAL_CATEGORIES) {
    const otherPool = other === category ? pool : await curatedDealPool(other);
    categories[other] = otherPool ? eligibleCount(otherPool, { age }, today) : null;
  }

  return Response.json(
    { category, origin: origin.value, counts, categories },
    { headers: { "Cache-Control": "no-store" } },
  );
}
